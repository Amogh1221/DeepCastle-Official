# 🚀 DEEPCASTLE v7 Professional Deployment Guide

This guide will help you deploy the **Ultimate Dual-Cloud Edition** of Deepcastle:
1.  **Backend (Brain):** Hosted on **Hugging Face Spaces** (16GB RAM + Engine)
2.  **Frontend (UI):** Hosted on **Vercel** (Premium Glassmorphism Website)

---

## 🧠 Part 1: Deploying the Backend (Hugging Face)

1.  Go to [huggingface.co/spaces](https://huggingface.co/spaces) and click **"Create new Space"**.
2.  **Name:** `deepcastle-api` (or any name you prefer).
3.  **SDK:** Select **Docker**.
4.  **Template:** Select **Blank**.
5.  **Visibility:** Public (so the frontend can reach it).
6.  **Upload:** In the "Files" tab, upload the contents of the `server/` folder:
    *   `main.py`
    *   `Dockerfile`
7.  **Engine File:** You must also upload the `engine/src` folder if you want it to compile, or upload a pre-compiled Linux binary.
    > **Note:** The current `Dockerfile` is set up to `COPY . .` from the root, so it's best to upload the **entire repository** to Hugging Face or use Git Sync.

---

## 🎨 Part 2: Deploying the Frontend (Vercel)

1.  Connect your GitHub repository to [Vercel](https://vercel.com/new).
2.  Select the **`web`** folder as the Root Directory.
3.  **Environment Variables:** Add a new variable:
    *   **Key:** `NEXT_PUBLIC_ENGINE_API_URL`
    *   **Value:** `https://your-space-name.hf.space` (Replace with your actual Hugging Face Space URL).
4.  Click **Deploy**.

---

## 🛠️ Local Development

To run everything on your own computer:

### 1. Start the Backend
```bash
cd server
pip install -r requirements.txt
python main.py
```

### 2. Start the Frontend
```bash
cd web
npm install
npm run dev
```

Visit `http://localhost:3000` to play!

---

Developed by Amogh Gupta & Antigravity AI
