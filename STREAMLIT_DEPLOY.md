# ♟️ DeepCastle Web: Streamlit Deployment (FREE & NO CARD)

This is the easiest way to share your bot. It requires **ZERO** payment details and **ZERO** credit cards.

---

## 🚀 1. Setup in 3 Minutes

1.  **Login:** Go to [share.streamlit.io](https://share.streamlit.io/) and log in with your **GitHub**.
2.  **New App:** Click the **"New App"** button.
3.  **Repository:** Select your `DeepCastle-Official` repository from the list.
4.  **Main File Path:** Type **`server/streamlit_app.py`**.
5.  **Advanced Settings (Optional):** Ensure **"Python 3.x"** is selected.

---

## 🏗️ 2. What Happens Next? (The "Magic")

When you click **Deploy**, Streamlit's Linux servers will see your `packages.txt` and install the C++ compiler. 

Our special `streamlit_app.py` script will then:
1.  **Auto-Compile:** It will find your Stockfish source code and run `make` automatically to create the Linux binary for you!
2.  **Download Brain:** It will fetch the official 100MB NNUE network if it's missing.
3.  **Launch:** Your bot will be live at a public URL like `https://deepcastle-v7.streamlit.app/`.

---

## 💎 3. Why This Is Better?
-   **No Cards:** Streamlit Community Cloud is 100% free and never asks for a card.
-   **No Linux Setup:** You can develop on Windows, and the script will handle the Linux conversion for you in the cloud.
-   **Always Online:** It stays online 24/7 without "going to sleep" as long as people visit it occasionally.

---

## 🛠️ 4. Local Testing on your PC
If you want to test the Streamlit UI locally:
1.  Open your terminal in the `server` folder.
2.  Install requirements: `pip install streamlit chess requests`
3.  Run: `streamlit run streamlit_app.py`

**Your bot is now ready for the world!**
