# 🌐 DeepCastle Web Deployment Guide

This guide explains how to deploy your chess bot website for **FREE** using Vercel (Frontend) and Render (Backend).

---

## 🏗️ 1. The Strategy
Chess engines are CPU-intensive C++ programs. While **Vercel** is perfect for your beautiful UI, its "Serverless Functions" have time limits that are too short for deep engine analysis. 

**The Solution:**
1.  **Frontend (Next.js):** Deployed on **Vercel**.
2.  **Backend (FastAPI):** Deployed on **Render.com** (Free Tier). This backend runs your engine and provides a move API to your website.

---

## 🚀 2. Deploying the Backend (Render.com)

Render allows you to run a Python web server for free.

1.  Create a free account on [Render.com](https://render.com/).
2.  Click **New +** -> **Web Service**.
3.  Connect your GitHub repository: `Amogh1221/DeepCastle-Official`.
4.  Set the following configuration:
    -   **Name:** `deepcastle-api`
    -   **Environment:** `Python 3`
    -   **Root Directory:** `server`
    -   **Build Command:** `pip install -r requirements.txt`
    -   **Start Command:** `uvicorn main:app --host 0.0.0.0 --port 10000`
5.  **Important:** You need a Linux version of your engine. Render runs Linux. You can either:
    -   Run the `engine/build_linux.sh` on a Linux machine and push the binary to Git.
    -   Or use a pre-compiled Stockfish Linux binary and rename it to `deepcastle_linux`.

6. once deployed, Render will give you a URL like `https://deepcastle-api.onrender.com`.

---

## 🎨 3. Deploying the Frontend (Vercel)

1.  Create a free account on [Vercel.com](https://vercel.com/).
2.  Click **Add New...** -> **Project**.
3.  Connect your GitHub repository.
4.  Set the following configuration:
    -   **Framework Preset:** `Next.js`
    -   **Root Directory:** `web`
5.  Add an **Environment Variable**:
    -   `NEXT_PUBLIC_ENGINE_API_URL`: **[The URL from Render]** (e.g., `https://deepcastle-api.onrender.com`)
6.  Click **Deploy**.

---

## 🛠️ 4. Local Testing
To test the website locally with your bot:
1.  **Start the Server:**
    ```bash
    cd server
    python main.py
    ```
2.  **Start the Website:**
    ```bash
    cd web
    npm run dev
    ```
3.  Open `http://localhost:3000` and start playing!

---

## 🧩 5. Why this is the best way?
-   **Zero Cost:** Both Vercel and Render have generous free tiers.
-   **Performance:** Your website remains fast and snappy while the engine does the heavy lifting on the server.
-   **Scalability:** You can easily upgrade your Render instance if you want your bot to think deeper (e.g., Depth 20+).

Enjoy your new online chess grandmaster!
