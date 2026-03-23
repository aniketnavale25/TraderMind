@echo off
echo Starting TraderMind...

:: Start Python backend
start "Backend" cmd /k "cd backend && venv\Scripts\activate && venv\Scripts\uvicorn api:app --reload --port 8000"

:: Start React frontend
start "Frontend" cmd /k "cd frontend && npm run dev"

echo Both servers started!
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173