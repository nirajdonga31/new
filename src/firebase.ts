import admin from "firebase-admin";
import fs from "fs";

if (!admin.apps.length) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath) {
        const json = JSON.parse(fs.readFileSync(credPath, "utf8"));
        admin.initializeApp({ credential: admin.credential.cert(json) });
    } else {
        admin.initializeApp();
    }
}

export default admin;
