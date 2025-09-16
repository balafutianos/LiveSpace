// changeEmail.js
const admin = require("firebase-admin");

// Load your service account key
const serviceAccount = require("./serviceAccountKey.json");

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

// Read arguments from command line
const [,, uid, newEmail] = process.argv;

if (!uid || !newEmail) {
  console.error("Usage: node changeEmail.js <uid> <newEmail>");
  process.exit(1);
}

changeUserEmail(uid, newEmail);
