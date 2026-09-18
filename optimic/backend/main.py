from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
import os

from fastapi.responses import JSONResponse

from agents import compile_state_graph

from auth import TOKEN_EXPIRE_DAYS, create_token, delete_user, get_or_create_user, verify_token
from chatbot import (
    add_user_dataset_record,
    check_dataset_exists,
    delete_dataset_from_qdrant,
    delete_dataset_from_registry,
    get_response_from_qdrant,
    get_user_dataset_record,
    initialize_chatbot,
    process_data_into_qdrant,
    clear_chat_history
)
from reports import generate_dataset_report
from anaylse import run_dataset_analysis
from models import ChatData, MarketingData, UploadData, UserData, AnalyseData, ReportData
from state import DeleteDatasetData


app = FastAPI()

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://optimic.vercel.app",
    "http://optimic.vercel.app"
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

graph = compile_state_graph()


@app.middleware("http")
async def authentication_middleware(request: Request, call_next):
    public_paths = {"/", "/authenticate", "/logout", "/docs", "/openapi.json"}

    if request.url.path in public_paths or request.method == "OPTIONS":
        return await call_next(request)

    token = request.cookies.get("auth_token")

    if not token:
        return Response(
            content='{"detail":"Authentication required"}',
            status_code=401,
            media_type="application/json",
        )

    try:
        user = verify_token(token)
    except Exception as e:
        return Response(
            content=f'{{"detail":"{str(e)}"}}',
            status_code=401,
            media_type="application/json",
        )

    request.state.user = user
    return await call_next(request)


@app.get("/")
def hello_world():
    return {"message": "Server is running"}


@app.post("/authenticate")
def authenticate_user(user_data: UserData, response: Response):
    user = get_or_create_user(user_data.email, user_data.name)
    token = create_token(user)
    print("Generated token:", token)

    content = {
        "message": "Authentication successful",
        "user": user,
    }
    response = JSONResponse(content=content)

    response.set_cookie(
        key="auth_token",
        value=token,
        secure=True,  # Set to True in production
        httponly=True, # Set to True to prevent access from JavaScript
        samesite="None", # for limit cookie sending in cross-site requests not same site
        max_age=TOKEN_EXPIRE_DAYS * 86400,
    )

    return response


@app.get("/me")
def get_me(request: Request):
    print("User info:", request.state.user)
    return {"user": request.state.user}


@app.post("/generate")
async def generate_offre(data: MarketingData, request: Request):
    user = request.state.user
    user_uid = user["uid"]

    thread_id = f"{user_uid}"
    inputs = {
        "offre_rules": data.policies,
        "customer_data": data.customer_data,
        "next": "SCORING",
    }

    config1 = {"configurable": {"thread_id": thread_id}}
    final_state = await graph.ainvoke(inputs, config1)

    return {
        "offre_rules": final_state.get("offre_rules"),
        "customer_data": final_state.get("customer_data"),
        "score": final_state.get("score"),
        "offre": final_state.get("offre"),
        "validation_feedback": final_state.get("validation_feedback"),
        "optimized_offre": final_state.get("optimized_offre"),
    }


@app.post("/upload-dataset")
async def upload_dataset(dataUploaded: UploadData, request: Request):
    try:
        user_uid = request.state.user.get("uid") or request.state.user.get("sub")
        dataset_id = dataUploaded.dataset_id
        dataset_name = dataUploaded.dataset_name
        rows = dataUploaded.rows
        headers = dataUploaded.headers

        user_exit = get_user_dataset_record(user_uid, dataset_id)

        if user_exit:
            dataset_exit = check_dataset_exists(user_uid, dataset_name)
            if dataset_exit:
                return {
                    "status": "Dataset already exists for this user",
                    "dataset_id": dataset_id,
                }
        else:
            add_user_dataset_record(user_uid, dataset_name, dataset_id)
            initialize_chatbot(user_uid)

        # Ensure dataset metadata is tracked in SQLite
        add_user_dataset_record(user_uid, dataset_name, dataset_id)

        process_data_into_qdrant(rows, headers, dataset_id, user_uid)

        return {
            "status": "Dataset saved in vector database",
            "dataset_id": dataset_id,
        }

    except Exception as e:
        print("Upload dataset failed:", e)
        raise HTTPException(status_code=500, detail="Request failed")


@app.post("/ask-question")
async def ask_question(data: ChatData, request: Request):
    user = request.state.user
    user_uid = user["uid"]
    answer = get_response_from_qdrant(user_uid, data.dataset_id, data.question)

    return {
        "question": data.question,
        "response": answer,
    }

@app.delete("/clear-chat-history")
async def clear_chat_history_endpoint(request: Request):
    user = request.state.user
    user_uid = user["uid"]

    # Clears state for this specific user's conversation thread
    await clear_chat_history(thread_id=user_uid)
    print(f"Chat history cleared for user {user_uid}")
    return {"message": "Chat history cleared successfully"}


@app.post("/delete-dataset")
async def delete_dataset(data: DeleteDatasetData, request: Request):
    user = request.state.user
    user_uid = user["uid"]
    dataset_id = data.dataset_id

    # 1. Delete matching vectors from Qdrant Cloud
    delete_dataset_from_qdrant(dataset_id=dataset_id, user_uid=user_uid)

    # 2. Delete dataset entry from local SQLite registry
    delete_dataset_from_registry(user_uid=user_uid, dataset_id=dataset_id)

    return {"message": "Dataset deleted successfully"}


@app.post("/logout")
def logout_user(response: Response):
    is_secure = os.getenv("MODE_TYPE") == "production"
    response.set_cookie(
        "auth_token", "", max_age=0, httponly=True, secure=False, samesite="lax"
    )
    response.delete_cookie(
        key="auth_token",
        httponly=True,
        secure=True,
        samesite="None",
    )
    return {"message": "Logged out successfully"}



@app.post("/analyse/query")
async def analyse_dataset(data: AnalyseData, request: Request):
    user = request.state.user

    result = await run_dataset_analysis(
        question=data.question,
        headers=data.headers,
        rows=data.rows,
        dataset_name=data.dataset_name,
    )

    return result


@app.post("/report")
async def generate_report(data: ReportData, request: Request):
    if not data.headers or not data.rows:
        raise HTTPException(
            status_code=400,
            detail="The active dataset contains no rows or columns to analyze."
        )

    try:
        result = await generate_dataset_report(
            headers=data.headers,
            rows=data.rows,
            dataset_name=data.dataset_name,
            report_type=data.report_type,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report error: {str(e)}")
