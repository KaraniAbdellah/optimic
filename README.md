# Optimic HERE

<img scr="./images/logo.png" alt="Optimic">>

**Optimic** is an AI-powered platform that automatically creates, tests, and improves personalized marketing offers for your customers.


<!-- <video scr="./images/video.mp4" /> -->

### What is Optimic?
Writing custom discount offers by hand takes a lot of time, and it is easy to make mistakes (like giving discounts that are too big). **Optimic** solves this by using a team of AI agents that work together under a central supervisor to read your data, check business rules, and write high-converting copy in seconds **(~2.3s)**.


### What you can do with Optimic?
With **Optimic**, you can upload customer files, select specific target rows, and produce personalized marketing promotions safely. Instead of switching between spreadsheets and copy tools, Optimic scores your leads, generates compliant text, visualizes data with charts, and writes executive summaries in one dashboard.

### Core Features
#### Multi-Agent Offer Studio
Select customer rows directly from your CSV files, enter your policy rules (such as max discount limits or coupon names), and let the agents generate tailored promotional copy instantly.

**Screen Shot**
........

#### Haut Gamme Assistant
Chat directly with your dataset using simple, everyday language. Instead of writing complex formulas or filtering spreadsheets manually, simply ask questions like "Give me the top 3 clients who bought the most tablets in September" or "Show me inactive users from last week". The assistant instantly scans your loaded data in memory, extracts the exact metrics, and returns clear, conversational answers right inside the studio

**Screen Shot**
........


#### Agent Analytics
You can ask questions in plain English and view automated bar charts, distributions, and frequency counts without writing complex code.

**Screen Shot**

#### Agent Analytics
You can ask questions in plain English and view automated bar charts, distributions, and frequency counts without writing complex code.

**Screen Shot**
........

#### Marketing Reporting Agent
Generate complete executive reports in one click. The reporting agent reads your dataset to display total records, unique addresses, domain distributions, and strategic takeaways to help you plan your next campaign.

**Screen Shot**


........

#### Installation

``` bash
# 1. Clone the repository
git clone https://github.com/KaraniAbdellah/optimic.git
cd optimic

# 2. Frontend SetUp
npm install
cp .env.example .env
npm run dev

# 3. Backend SetUp
curl -LsSf https://astral.sh/uv/install.sh | sh
cd backend
uv venv
source .venv/bin/activate
uv pip install requirements.txt
cp .env.example .env
uv run uvicorn main:app --reload --port 8000
```


#### Technical Stack
**Architecture:** Multi-agent supervisor pattern with centralized orchestration, including Data Fetcher, Scoring Agent, Generation Agent, Validation Agent, and Optimization Agent.

**Frontend:** React, Tailwind CSS

**Backend:** FastAPI

**Database:** Qdrant, DuckDB

**DevOps & Cloud:** Docker, GitHub Actions, CI/CD, Google Cloud Run
#### Contribution
Contributions are welcome:






**Created by <a href="https://www.linkedin.com/in/abdellah-karani-965928294/">@abdellah_karani</a>**
