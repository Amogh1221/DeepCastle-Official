# 🌐 DeepCastle Web Deployment Guide

This guide explains how to deploy your chess bot website for **FREE** with **ZERO payment details (No Card)**.

---

## 🏆 1. The Recommended Choice: Streamlit (No Card, 100% Free)
This is the **easiest and best** way to share your bot. It works on Streamlit's Community Cloud and is completely free forever.

1.  **Frontend + Backend:** DeepCastle v7 runs as a single-file application on Streamlit.
2.  **Autonomous Setup:** Our special `streamlit_app.py` script automatically **compiles** your C++ engine from source on Streamlit's Linux servers.

**Steps:**
- Follow the **[STREAMLIT_DEPLOY.md](STREAMLIT_DEPLOY.md)** file for 3-minute setup instructions.
- Login at [share.streamlit.io](https://share.streamlit.io/) with your GitHub.
- Select `server/streamlit_app.py`.

---

## 🏗️ 2. The Advanced Choice: Vercel + Koyeb (If you want a card-linked VPS)
If you have a card and want a high-end Next.js UI, you can follow the Docker deployment:
1.  **Frontend (Next.js):** Deployed on **Vercel**.
2.  **Backend (FastAPI + Docker):** Deployed on **Koyeb** or **Hugging Face**.
- Use the `server/Dockerfile` provided in your repo.

---

## 🛠️ 3. Why This Is A Professional Setup?
-   **Multi-Platform Support:** You can build on **Windows** and the deployment scripts will "Auto-Compile" for **Linux** in the cloud.
-   **High-End Performance:** Includes the **HalfKAv2 (v7)** NNUE model for master-level play.
-   **Zero Maintenance:** The neural network weights are automatically downloaded when the cloud server boots up.

Enjoy your new online chess grandmaster!
