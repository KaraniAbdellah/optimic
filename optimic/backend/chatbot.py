import sqlite3
import uuid

from dotenv import dotenv_values
from groq import Groq
from langchain.agents import create_agent
from langchain.agents.middleware import SummarizationMiddleware
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.checkpoint.memory import InMemorySaver
from qdrant_client import QdrantClient, models
from qdrant_client.http.exceptions import UnexpectedResponse
from qdrant_client.http.models import Document, FusionQuery, PointStruct
from state import fast_llm
from langchain_core.messages import RemoveMessage
from langgraph.graph.message import REMOVE_ALL_MESSAGES
from state import CHATBOT_PROMPT



# Load environment variables
config = dotenv_values(".env")
QDRANT_CLOUD_API_KEY = config.get("QDRANT_CLOUD_API_KEY")
QDRANT_CLOUD_ENDPOINT = config.get("QDRANT_CLOUD_ENDPOINT")
GROQ_API_KEY = config.get("GROQ_API_KEY")

CHATS_DB = "chats.db"
COLLECTION_NAME = "optimic_collection"

# Connect to Qdrant Cloud
client_qdrant = QdrantClient(
    url=QDRANT_CLOUD_ENDPOINT,
    api_key=QDRANT_CLOUD_API_KEY,
    cloud_inference=True,
    timeout=60,
)


# Connect to Groq
client_groq = Groq(api_key=GROQ_API_KEY)


# Create Agent
agent = create_agent(
    model=fast_llm,
    tools=[],
    middleware=[
        SummarizationMiddleware(
            model=fast_llm, trigger=("tokens", 2000), keep=("messages", 10)
        )
    ],
    checkpointer=InMemorySaver(),
)


# def init_chats_db():
#     with sqlite3.connect(CHATS_DB) as conn:
#         conn.execute("""
#             CREATE TABLE IF NOT EXISTS datasets (
#                 user_uid TEXT,
#                 dataset_id TEXT PRIMARY KEY,
#                 dataset_name TEXT
#             )
#         """)


# init_chats_db()


def get_user_dataset_record(user_uid: str, dataset_id: str) -> bool:
    """Check if any datasets exist for the user."""
    with sqlite3.connect(CHATS_DB) as conn:
        row = conn.execute(
            "SELECT 1 FROM datasets WHERE user_uid = ? LIMIT 1", (user_uid,)
        ).fetchone()
        return row is not None


def check_dataset_exists(user_uid: str, dataset_name: str) -> bool:
    """Check if a specific dataset name exists for the given user."""
    with sqlite3.connect(CHATS_DB) as conn:
        row = conn.execute(
            "SELECT 1 FROM datasets WHERE user_uid = ? AND dataset_name = ? LIMIT 1",
            (user_uid, dataset_name),
        ).fetchone()
        return row is not None


def add_user_dataset_record(user_uid: str, dataset_name: str, dataset_id: str):
    """Insert or update a dataset record."""
    with sqlite3.connect(CHATS_DB) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO datasets (user_uid, dataset_id, dataset_name) VALUES (?, ?, ?)",
            (user_uid, dataset_id, dataset_name),
        )


def delete_dataset_from_registry(user_uid: str, dataset_id: str):
    """Delete a dataset from SQLite."""
    with sqlite3.connect(CHATS_DB) as conn:
        conn.execute(
            "DELETE FROM datasets WHERE user_uid = ? AND dataset_id = ?",
            (user_uid, dataset_id),
        )
    print(f"Dataset {dataset_id} removed from SQLite registry for user {user_uid}.")


def initialize_chatbot(user_uid: str):
    """Ensure collection, indices, and user shard exist."""
    collections = client_qdrant.get_collections().collections
    collection_exists = any(c.name == COLLECTION_NAME for c in collections)
    print(f"Collection exists: {collection_exists}")
    if not collection_exists:
        client_qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config={
                "dense": models.VectorParams(
                    size=384,
                    distance=models.Distance.COSINE,
                )
            },
            sparse_vectors_config={
                "sparse": models.SparseVectorParams(modifier=models.Modifier.IDF)
            },
            sharding_method=models.ShardingMethod.CUSTOM,
        )

        # Create required payload indices so filtering and deleting works
        client_qdrant.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name="dataset_id",
            field_schema="keyword",
        )
        client_qdrant.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name="user_uid",
            field_schema="keyword",
        )

    print("Initializing Qdrant Collection for user By Creating Shard:", user_uid)
    try:
        client_qdrant.create_shard_key(
            collection_name=COLLECTION_NAME, shard_key=user_uid
        )
    except UnexpectedResponse:
        pass


def add_doc_qdrant_cloud(rows: list, headers: list, payload: dict, user_uid: str):
    print("Adding documents to Qdrant Cloud...")

    for row in rows:
        doc = ""
        for header, value in zip(headers, row):
            doc += f"{header}: {value}\n"
        payload["text"] = doc
        points = [
            models.PointStruct(
                id=uuid.uuid4().hex,
                vector={
                    "dense": Document(
                        text=doc,
                        model="sentence-transformers/all-MiniLM-L6-v2",
                    ),
                    "sparse": Document(
                        text=doc,
                        model="Qdrant/bm25",
                    ),
                },
                payload=payload,
            )
        ]
        client_qdrant.upsert(
            collection_name=COLLECTION_NAME,
            points=points,
            shard_key_selector=user_uid,
        )


def process_data_into_qdrant(
    rows: list[list[str]], headers: list[str], dataset_id: str, user_uid: str
):
    print("Processing data into Qdrant...")
    payload = {"dataset_id": dataset_id, "user_uid": user_uid}
    add_doc_qdrant_cloud(rows, headers, payload, user_uid)


def get_relevant_chunks_from_qdrant(
    question: str, dataset_uid: str, user_uid: str, limit: int = 5
) -> str:
    try:
        results = client_qdrant.query_points(
            collection_name=COLLECTION_NAME,
            shard_key_selector=user_uid,
            query_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="dataset_id",
                        match=models.MatchValue(value=dataset_uid),
                    )
                ]
            ),
            prefetch=[
                models.Prefetch(
                    query=Document(
                        text=question,
                        model="sentence-transformers/all-MiniLM-L6-v2",
                    ),
                    using="dense",
                    limit=limit * 2,
                ),
                models.Prefetch(
                    query=Document(
                        text=question,
                        model="Qdrant/bm25",
                    ),
                    using="sparse",
                    limit=limit * 2,
                ),
            ],
            query=FusionQuery(fusion=models.Fusion.RRF),
            limit=limit,
        )
        print("results:", results)
        chunks = []
        for point in results.points:
            chunks.append(point.payload.get("text"))

        if not chunks:
            return "No relevant chunks found."

        return "\n".join(f"- {chunk}" for chunk in chunks)

    except Exception as e:
        print(f"Error querying Qdrant: {e}")
        return ""


def generate_response(question: str, context: str, user_uid: str) -> str:
    sys_prompt = CHATBOT_PROMPT
    message = f"""
        Question: {question}
        Context: {context}
    """

    messages = [
        SystemMessage(content=sys_prompt),
        HumanMessage(content=message),
    ]
    thread_config = {"configurable": {"thread_id": user_uid}}
    response = agent.invoke(
        {"messages": messages},
        thread_config,
    )["messages"][-1].content
    print(response)

    return response


def get_response_from_qdrant(user_uid: str, dataset_id: str, question: str) -> str:
    relevant_chunks = get_relevant_chunks_from_qdrant(question, dataset_id, user_uid)
    return generate_response(question, relevant_chunks, user_uid)


async def clear_chat_history(thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}

    # Update the graph state directly using the special REMOVE_ALL_MESSAGES marker
    await agent.aupdate_state(
        config,
        {"messages": [RemoveMessage(id=REMOVE_ALL_MESSAGES)]},
    )


def delete_dataset_from_qdrant(dataset_id: str, user_uid: str):
    try:
        client_qdrant.delete(
            collection_name=COLLECTION_NAME,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="dataset_id",
                            match=models.MatchValue(value=dataset_id),
                        ),
                        models.FieldCondition(
                            key="user_uid",
                            match=models.MatchValue(value=user_uid),
                        ),
                    ]
                )
            ),
            shard_key_selector=user_uid,
        )
        print("Dataset deleted successfully from Qdrant.")
    except Exception as e:
        print(f"Failed to delete dataset: {e}")
