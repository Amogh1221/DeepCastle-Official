# 🌐 DeepCastle Web Deployment Guide

This guide explains how to deploy your chess bot website for **FREE** using Vercel (Frontend) and Koyeb or Hugging Face (Backend).

---

## 🏗️ 1. The Strategy
Chess engines are CPU-intensive C++ programs. To keep it 100% free and unlimited, we separate the UI from the Engine.

1.  **Frontend (Next.js):** Deployed on **Vercel**.
2.  **Backend (FastAPI + Docker):** Deployed on **Koyeb** or **Hugging Face Spaces**. These platforms allow us to run a "Docker Container," which is a mini-Linux system that automatically compiles and runs your engine!

---

## 🚀 2. Option A: Deploying on Koyeb (Fast & Easy)

1.  Create a free account on [Koyeb.com](https://www.koyeb.com/).
2.  Click **Create Service**.
3.  Choose **GitHub** and select your repository: `Amogh1221/DeepCastle-Official`.
4.  **Configuration:**
    -   **Deployment Strategy:** Docker (Look for the `server/Dockerfile`).
    -   **Region:** Choose the one closest to you.
    -   **Instance Size:** "Nano" (This is the **FREE** forever instance).
    -   **Port:** `8000`.
5.  Click **Deploy**.
6.  Once live, Koyeb will give you a URL like `https://deepcastle-api-amogh.koyeb.app`.

---

## 🤗 3. Option B: Deploying on Hugging Face Spaces (24/7 Awake)

1.  Create a free account on [HuggingFace.co](https://huggingface.co/).
2.  Click **New** -> **Space**.
3.  Name it (e.g., `deepcastle-engine`) and choose **Docker** as the SDK.
4.  **Hardware:** Choose "CPU Basic" (This is **Free** and stays 24/7 awake if you select Public).
5.  Upload your repository files or connect your GitHub.
6.  It will automatically detect the `Dockerfile` and start building your engine!

---

## 🎨 4. Deploying the Frontend (Vercel)

1.  Create a free account on [Vercel.com](https://vercel.com/).
2.  Click **Add New...** -> **Project**.
3.  Connect your GitHub repository.
4.  **Configuration:**
    -   **Framework Preset:** `Next.js`
    -   **Root Directory:** `web`
5.  Add **Environment Variable**:
    -   Name: `NEXT_PUBLIC_ENGINE_API_URL`
    -   Value: **[Your URL from Koyeb or Hugging Face]**
6.  Click **Deploy**.

---

## 🛠️ 5. Local Testing
To test the website locally:
1.  **Start Server:** `cd server && python main.py`
2.  **Start Website:** `cd web && npm run dev`
3.  Open `http://localhost:3000`.

---

## 🧩 6. Why Docker?
I provided a `Dockerfile` in the `/server` folder. This is a special file that tells the cloud exactly how to build your C++ engine on Linux. This means you don't have to manually compile anything for the web—the cloud does it for you every time you push code!

Enjoy your online chessbot empire!
