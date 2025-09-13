# Smart Auto-Labeling with Real-Time Client Feedback

🚀 A hybrid NLP annotation pipeline that combines ML-powered auto-labeling with human review and real-time client feedback.

## 🎯 Problem Statement

- **Pure auto-labeling**: Fast but error-prone on edge cases
- **Pure manual labeling**: Accurate but slow and expensive  
- **Client feedback**: Usually comes too late, causing rework

## 💡 Solution

A transparent, collaborative pipeline where:
1. **Auto-labeler** generates initial predictions with confidence scores
2. **Annotators** quickly review/correct instead of labeling from scratch
3. **Client portal** provides real-time visibility and feedback capability
4. **Active learning** loop improves the model with corrections

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Raw Dataset   │───▶│   Auto-Labeler   │───▶│ Annotator UI    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Client Portal   │◀───│   Database       │◀───│ Feedback Loop   │
└─────────────────┘    └──────────────────┘    └─────────────────┘

Note: ALL tasks go through Annotator UI regardless of confidence level
```

## 🚀 Quick Start

### Option 1: Automated Setup (Recommended)
```bash
# Run the setup script
python3 setup.py

# Start the entire system
./start_system.sh

# Access the application
# Dashboard: http://localhost:3000
# API Docs: http://localhost:8000/docs
```

### Option 2: Manual Setup
```bash
# Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
python -m uvicorn main:app --reload

# Frontend setup (in new terminal)
cd frontend
npm install
npm start
```

### Option 3: Docker (Production)
```bash
# Start with Docker Compose
docker-compose up --build

# Access the application
# Dashboard: http://localhost:3000
# API Docs: http://localhost:8000/docs
```

## 📊 Demo Flow

1. **Upload Dataset** → Raw text data
2. **Auto-Label** → ML generates initial predictions
3. **Annotator Review** → Quick corrections with confidence guidance
4. **Client Feedback** → Real-time sample review and approval
5. **Export Results** → High-quality labeled dataset

## 🎯 Business Value

- **40-60% faster** than pure manual labeling
- **Real-time transparency** builds client trust
- **Fewer re-work cycles** through early feedback
- **Continuous improvement** via active learning
