#!/usr/bin/env python3
"""
Setup script for Smart Auto-Labeling project
"""

import subprocess
import sys
import os

def run_command(command, description):
    """Run a shell command and handle errors"""
    print(f"\n🔄 {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed successfully")
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"❌ Error in {description}: {e.stderr}")
        return None

def setup_backend():
    """Setup Python backend"""
    print("\n🐍 Setting up Python backend...")
    
    # Check if Python is available
    python_version = run_command("python3 --version", "Checking Python version")
    if not python_version:
        print("❌ Python 3 is required but not found")
        return False
    
    # Create virtual environment
    if not os.path.exists("backend/venv"):
        run_command("cd backend && python3 -m venv venv", "Creating virtual environment")
    
    # Install requirements
    run_command("cd backend && source venv/bin/activate && pip install -r requirements.txt", 
                "Installing Python dependencies")
    
    # Download spaCy model
    run_command("cd backend && source venv/bin/activate && python -m spacy download en_core_web_sm", 
                "Downloading spaCy English model")
    
    return True

def setup_frontend():
    """Setup React frontend"""
    print("\n⚛️ Setting up React frontend...")
    
    # Check if Node.js is available
    node_version = run_command("node --version", "Checking Node.js version")
    if not node_version:
        print("❌ Node.js is required but not found")
        return False
    
    # Install dependencies (already done during create-react-app)
    run_command("cd frontend && npm install", "Installing Node.js dependencies")
    
    return True

def setup_database():
    """Setup database (SQLite for demo)"""
    print("\n🗄️ Setting up database...")
    
    # For demo, we'll use SQLite instead of PostgreSQL
    # Update database URL in backend
    db_config = '''
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base

# Use SQLite for demo
DATABASE_URL = "sqlite:///./smart_labeling.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def create_tables():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    create_tables()
    print("Database initialized successfully!")
'''
    
    with open("backend/database.py", "w") as f:
        f.write(db_config)
    
    print("✅ Database configuration updated for SQLite")
    return True

def create_startup_scripts():
    """Create startup scripts"""
    print("\n📝 Creating startup scripts...")
    
    # Backend startup script
    backend_script = '''#!/bin/bash
echo "🚀 Starting Smart Auto-Labeling Backend..."
cd backend
source venv/bin/activate
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
'''
    
    with open("start_backend.sh", "w") as f:
        f.write(backend_script)
    os.chmod("start_backend.sh", 0o755)
    
    # Frontend startup script
    frontend_script = '''#!/bin/bash
echo "🚀 Starting Smart Auto-Labeling Frontend..."
cd frontend
npm start
'''
    
    with open("start_frontend.sh", "w") as f:
        f.write(frontend_script)
    os.chmod("start_frontend.sh", 0o755)
    
    # Combined startup script
    combined_script = '''#!/bin/bash
echo "🚀 Starting Smart Auto-Labeling System..."

# Start backend in background
echo "Starting backend..."
./start_backend.sh &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start frontend
echo "Starting frontend..."
./start_frontend.sh &
FRONTEND_PID=$!

echo "✅ System started!"
echo "📊 Dashboard: http://localhost:3000"
echo "🔧 API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for user interrupt
trap "echo 'Stopping services...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
'''
    
    with open("start_system.sh", "w") as f:
        f.write(combined_script)
    os.chmod("start_system.sh", 0o755)
    
    print("✅ Startup scripts created")
    return True

def main():
    """Main setup function"""
    print("🚀 Smart Auto-Labeling Setup")
    print("=" * 50)
    
    success = True
    
    # Setup components
    if not setup_database():
        success = False
    
    if not setup_backend():
        success = False
    
    if not setup_frontend():
        success = False
    
    if not create_startup_scripts():
        success = False
    
    if success:
        print("\n" + "=" * 50)
        print("✅ Setup completed successfully!")
        print("\n🚀 To start the system:")
        print("   ./start_system.sh")
        print("\n📊 Access points:")
        print("   • Dashboard: http://localhost:3000")
        print("   • API Docs: http://localhost:8000/docs")
        print("\n📁 Demo data available in demo_data/ folder")
        print("=" * 50)
    else:
        print("\n❌ Setup encountered errors. Please check the output above.")
        sys.exit(1)

if __name__ == "__main__":
    main()
