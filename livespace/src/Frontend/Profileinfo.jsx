import React from "react";
import "./Profileinfo.css";

function ProfileInfo({
  userData,
  editing,
  profileForm,
  setProfileForm,
  setEditing,
  handleSaveProfile,
  handleCancelEdit
}) {
  return (
    <div style={{ marginTop: "70px", padding: "16px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>
            {userData?.firstName || ""} {userData?.lastName || ""}
          </h2>
          <p style={{ margin: "4px 0 0 0", color: "#555" }}>{userData?.email}</p>
        </div>

        <div>
          {!editing ? (
            <button onClick={() => setEditing(true)} style={{ padding: "8px 12px" }}>
              Edit Profile
            </button>
          ) : (
            <>
              <button
                onClick={handleSaveProfile}
                style={{ padding: "8px 12px", marginRight: 8 }}
              >
                Save
              </button>
              <button onClick={handleCancelEdit} style={{ padding: "8px 12px" }}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Profile details */}
      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12
        }}
      >
        {/* Left column */}
        <div>
          <div style={{ marginBottom: 10 }}>
            <label>Phone</label>
            {editing ? (
              <input
                value={profileForm.phone}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, phone: e.target.value })
                }
                style={{ width: "100%", padding: 8 }}
              />
            ) : (
              <div style={{ color: "#444" }}>
                {userData?.phone || (
                  <small style={{ color: "#888" }}>Not provided</small>
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 10 }}>
            <label>Sex</label>
            {editing ? (
              <select
                value={profileForm.sex}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, sex: e.target.value })
                }
                style={{ width: "100%", padding: 8 }}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            ) : (
              <div style={{ color: "#444" }}>
                {userData?.sex || (
                  <small style={{ color: "#888" }}>Not provided</small>
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 10 }}>
            <label>Birthday</label>
            {editing ? (
              <input
                type="date"
                value={profileForm.birthday}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, birthday: e.target.value })
                }
                style={{ width: "100%", padding: 8 }}
              />
            ) : (
              <div style={{ color: "#444" }}>
                {userData?.birthday || (
                  <small style={{ color: "#888" }}>Not provided</small>
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 10 }}>
            <label>Work</label>
            {editing ? (
              <input
                value={profileForm.work}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, work: e.target.value })
                }
                style={{ width: "100%", padding: 8 }}
              />
            ) : (
              <div style={{ color: "#444" }}>
                {userData?.work || (
                  <small style={{ color: "#888" }}>Not provided</small>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div>
          {/* City field with Google Maps link */}
          <div style={{ marginBottom: "8px" }}>
            <strong>City:</strong>{" "}
            {editing ? (
              <input
                value={profileForm.city}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, city: e.target.value })
                }
                style={{ padding: "4px", fontSize: "14px", width: "220px" }}
              />
            ) : userData?.city ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  userData.city
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#1a73e8", textDecoration: "none" }}
              >
                {userData.city}
              </a>
            ) : (
              <div style={{ color: "#444" }}>
                <small style={{ color: "#888" }}>Not provided</small>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 10 }}>
            <label>About me</label>
            {editing ? (
              <textarea
                value={profileForm.about}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, about: e.target.value })
                }
                rows={4}
                style={{ width: "100%", padding: 8 }}
              />
            ) : (
              <div style={{ color: "#444" }}>
                {userData?.about || (
                  <small style={{ color: "#888" }}>Not provided</small>
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 10 }}>
            <label>Email</label>
            {editing ? (
              <input
                value={profileForm.email}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, email: e.target.value })
                }
                style={{ width: "100%", padding: 8 }}
              />
            ) : (
              <div style={{ color: "#444" }}>
                {userData?.email || (
                  <small style={{ color: "#888" }}>Not provided</small>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Member since */}
      <div style={{ marginTop: 12, color: "#666", fontSize: 13 }}>
        <strong>Member since:</strong>{" "}
        {userData?.memberSince?.toDate
          ? userData.memberSince.toDate().toLocaleDateString()
          : userData?.memberSince
          ? new Date(userData.memberSince).toLocaleDateString()
          : "Unknown"}
      </div>
    </div>
  );
}

export default ProfileInfo;
