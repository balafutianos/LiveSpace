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
    <div style={{ display: "flex", marginTop: "70px", padding: "0 24px", gap: "24px" }}>
      {/* Left Section: Profile Info */}
      <div style={{ flex: 2 }}>
        <div
          style={{
            padding: "16px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            backgroundColor: "#f9f9f9"
          }}
        >
          {/* Header Row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "20px", color: "#222" }}>Profile Card</h2>
            </div>

            <div>
              {!editing ? (
                <button onClick={() => setEditing(true)} style={{ padding: "6px 10px", fontSize: "13px" }}>
                  Edit Profile
                </button>
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
          </div>

          {/* Profile details grid */}
          <div
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              fontSize: "14px"
            }}
          >
            {/* Left column */}
            <div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: "bold" }}>Phone</label>
                {editing ? (
                  <input
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    style={{ width: "100%", padding: "6px" }}
                  />
                ) : (
                  <div style={{ color: "#444" }}>
                    {userData?.phone || <small style={{ color: "#888" }}>Not provided</small>}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: "bold" }}>Sex</label>
                {editing ? (
                  <select
                    value={profileForm.sex}
                    onChange={(e) => setProfileForm({ ...profileForm, sex: e.target.value })}
                    style={{ width: "100%", padding: "6px" }}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                ) : (
                  <div style={{ color: "#444" }}>
                    {userData?.sex || <small style={{ color: "#888" }}>Not provided</small>}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: "bold" }}>Birthday</label>
                {editing ? (
                  <input
                    type="date"
                    value={profileForm.birthday}
                    onChange={(e) => setProfileForm({ ...profileForm, birthday: e.target.value })}
                    style={{ width: "100%", padding: "6px" }}
                  />
                ) : (
                  <div style={{ color: "#444" }}>
                    {userData?.birthday || <small style={{ color: "#888" }}>Not provided</small>}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: "bold" }}>Work</label>
                {editing ? (
                  <input
                    value={profileForm.work}
                    onChange={(e) => setProfileForm({ ...profileForm, work: e.target.value })}
                    style={{ width: "100%", padding: "6px" }}
                  />
                ) : (
                  <div style={{ color: "#444" }}>
                    {userData?.work || <small style={{ color: "#888" }}>Not provided</small>}
                  </div>
                )}
              </div>
            </div>

            {/* Right column */}
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
      </div>

      {/* Right Section: Friends List (placeholder) */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            border: "1px solid #ccc",
            borderRadius: "4px",
            backgroundColor: "#f4f4f4",
            padding: "10px"
          }}
        >
          <h4 style={{ marginTop: 0 }}>Friends</h4>
          <p style={{ fontSize: "13px", color: "#777" }}>Friend list coming soon...</p>
        </div>
      </div>
    </div>
  );
}

export default ProfileInfo;
