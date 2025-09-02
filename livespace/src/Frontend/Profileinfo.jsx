// ProfileInfo.jsx
import React from "react";
import FriendList from "./FriendList";
import PhotoGrid from "./PhotoGrid";

function ProfileInfo({
  userData,
  editing,
  profileForm,
  setProfileForm,
  setEditing,
  canEdit = false,
  handleSaveProfile,
  handleCancelEdit,
  profileUserId
}) {
  return (
    <div style={{ display: "flex", marginTop: "70px", padding: "0 24px", gap: "24px" }}>
      {/* Left: Profile Card */}
      <div style={{ flex: 2 }}>
        <div
          style={{
            padding: "16px",
            marginLeft: "-23px",
            marginTop: "-67px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            backgroundColor: "#f9f9f9"
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: "20px", color: "#222" }}>Profile Card</h2>
            {!editing ? (
              canEdit && (
                <button onClick={() => setEditing(true)} style={{ padding: "6px 10px", fontSize: "13px" }}>
                  Edit Profile
                </button>
              )
            ) : (
              <>
                <button
                  onClick={handleSaveProfile}
                  style={{ padding: "6px 10px", fontSize: "13px", marginRight: 6 }}
                >
                  Save
                </button>
                <button onClick={handleCancelEdit} style={{ padding: "6px 10px", fontSize: "13px" }}>
                  Cancel
                </button>
              </>
            )}
          </div>

          {/* Details Grid */}
          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              fontSize: "14px"
            }}
          >
            {/* Column 1 */}
            <div>
              {["phone", "sex", "birthday", "work"].map((field) => (
                <div style={{ marginBottom: 10 }} key={field}>
                  <label style={{ fontWeight: "bold", textTransform: "capitalize" }}>{field}</label>
                  {editing ? (
                    field === "sex" ? (
                      <select
                        value={profileForm.sex}
                        onChange={(e) => setProfileForm({ ...profileForm, sex: e.target.value })}
                        style={{ width: "100%", padding: "6px" }}
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    ) : (
                      <input
                        type={field === "birthday" ? "date" : "text"}
                        value={profileForm[field]}
                        onChange={(e) => setProfileForm({ ...profileForm, [field]: e.target.value })}
                        style={{ width: "100%", padding: "6px" }}
                      />
                    )
                  ) : (
                    <div style={{ color: "#444" }}>
                      {userData?.[field] || <small style={{ color: "#888" }}>Not provided</small>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Column 2 */}
            <div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: "bold" }}>City</label>
                {editing ? (
                  <input
                    value={profileForm.city}
                    onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                    style={{ width: "100%", padding: "6px" }}
                  />
                ) : userData?.city ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(userData.city)}`}
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
                <label style={{ fontWeight: "bold" }}>About me</label>
                {editing ? (
                  <textarea
                    value={profileForm.about}
                    onChange={(e) => setProfileForm({ ...profileForm, about: e.target.value })}
                    rows={3}
                    style={{ width: "100%", padding: 6 }}
                  />
                ) : (
                  <div style={{ color: "#444" }}>
                    {userData?.about || <small style={{ color: "#888" }}>Not provided</small>}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: "bold" }}>Email</label>
                {editing ? (
                  <input
                    value={profileForm.email}
                    onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                    style={{ width: "100%", padding: "6px" }}
                  />
                ) : (
                  <div style={{ color: "#444" }}>
                    {userData?.email || <small style={{ color: "#888" }}>Not provided</small>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Member Since */}
          <div style={{ marginTop: 12, color: "#666", fontSize: 13 }}>
            <strong>Member since:</strong>{" "}
            {userData?.memberSince?.toDate
              ? userData.memberSince.toDate().toLocaleDateString()
              : userData?.memberSince
              ? new Date(userData.memberSince).toLocaleDateString()
              : "Unknown"}
          </div>
        </div>
      </div>

    
    </div>
  );
}

export default ProfileInfo;
