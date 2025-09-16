// changeEmail.js
const admin = require("firebase-admin");

// Load your service account key
const serviceAccount = require("./serviceAccountKey.json");

// Initialize the app
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Function to update user email
async function changeUserEmail(uid, newEmail) {
  try {
    const userRecord = await admin.auth().updateUser(uid, {
      email: newEmail,
    });
    console.log(`✅ Successfully updated user ${uid} → ${newEmail}`);
  } catch (error) {
    console.error("❌ Error updating email:", error);
  }
}

// Example usage (replace with your user UID and new email)
const uid = "P9BFjgscLfZ7OARp4LCMKj3rvDB3"; // copy from Firebase Console
const newEmail = "someonedude1622@gmail.com";

changeUserEmail(uid, newEmail);
