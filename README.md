# 💸 SplitSmart - Cloud-Based Trip Expense Splitter

SplitSmart is a full-stack web application that allows users to create trips and manage shared expenses among friends. The project is fully containerized and deployed using a modern cloud-native architecture.

## 🌐 Live Application
* **Frontend (UI):** [Paste your Render Static Site URL here]
* **Backend (API):** [Paste your Render Web Service URL here]

---

## 🏗️ System Architecture
The project is built using the **MERN** stack (excluding React) and is hosted on a distributed cloud infrastructure:

* **Frontend:** HTML5, CSS3, and JavaScript (Vanilla), hosted as a **Static Site on Render**.
* **Backend:** Node.js with Express.js API, hosted as a **Web Service on Render**.
* **Database:** **MongoDB Atlas** (Cloud NoSQL) for persistent data storage.
* **Containerization:** The backend is deployed using **Docker** for environment consistency.
* **CI/CD:** Automatic deployment triggered via **GitHub** integration.



---

## 🛠️ Tech Stack
* **Language:** JavaScript (Node.js)
* **Framework:** Express.js
* **Database:** MongoDB Atlas
* **Deployment:** Render & Docker
* **Version Control:** Git & GitHub

---

## 🚀 Local Setup Instructions

1.  **Clone the Repo:**
    ```bash
    git clone [https://github.com/Sanika-Madihal/splitter-project.git](https://github.com/Sanika-Madihal/splitter-project.git)
    cd splitter-project
    ```
2.  **Setup Backend:**
    * Navigate to the `backend/` folder.
    * Create a `.env` file and add: `MONGODB_URI=your_mongodb_connection_string`.
    * Run `npm install` and `node server.js`.
3.  **Setup Frontend:**
    * Open `frontend/script.js`.
    * Set `const BASE_URL = 'http://localhost:10000';`.
    * Open `frontend/public/index.html` in your browser.

---

## 📝 Features & Functionality
* **Trip Management:** Create and track multiple trips.
* **Expense Splitting:** Add expenses and assign them to specific participants.
* **Real-time Data Sync:** All data is synced instantly to the cloud database.
* **Scalable Backend:** Dockerized environment allows for easy scaling on cloud platforms.

## 🎓 Academic Context
* **Course:** 5th Semester Cloud Computing (CC) Lab
* **Deployment Goal:** Demonstrate cross-origin communication between a CDN-hosted frontend and a containerized cloud backend.
