// src/components/ProfileInfo.jsx
import React from "react";
import Select, { components } from "react-select";

/* ---------- Theme ---------- */
const UI = {
  bg: "#071c29",
  bgSoft: "#0b2536",
  border: "#123547",
  borderHover: "#2b6d8f",
  text: "#e6f7f4",
  textSubtle: "#a6c9c2",
  accent: "#2cc9b6",
  danger: "#ff9c9c",
  radius: 14,
  inputH: 40,
  gap: 12,
};

/* ---------- Countries (trim here; add your full list) ---------- */
const COUNTRIES = [
  { name: "United States", iso2: "US", dial: "1" },
  { name: "United Kingdom", iso2: "GB", dial: "44" },
  { name: "Canada", iso2: "CA", dial: "1" },
  { name: "Greece", iso2: "GR", dial: "30" },
  { name: "Germany", iso2: "DE", dial: "49" },
  { name: "India", iso2: "IN", dial: "91" },
  // ...paste your full list here
];

/* ---------- Helpers ---------- */
const flagEmoji = (iso2 = "") =>
  iso2
    ? iso2
        .toUpperCase()
        .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    : "";

const countryCallingCode = (dial = "") => {
  const m = dial.match(/\d+/);
  return m ? m[0] : "";
};
const countryToOption = (c) => ({
  value: c.iso2,
  iso2: c.iso2,
  name: c.name,
  dial: countryCallingCode(c.dial),
  label: `${c.name} (+${countryCallingCode(c.dial)})`,
});

const FlagIcon = ({ iso2, size = 20 }) => {
  const url = `https://flagcdn.com/w${size}/${(iso2 || "").toLowerCase()}.png`;
  return (
    <img
      src={url}
      alt={iso2}
      width={size}
      height={size * 0.75}
      style={{ borderRadius: 2, objectFit: "cover", marginRight: 8 }}
    />
  );
};

const Option = (props) => (
  <components.Option {...props}>
    <div style={{ display: "flex", alignItems: "center" }}>
      <FlagIcon iso2={props.data.iso2} />
      <span>+{props.data.dial} — {props.data.name}</span>
    </div>
  </components.Option>
);
const SingleValue = (props) => (
  <components.SingleValue {...props}>
    <div style={{ display: "flex", alignItems: "center" }}>
      <FlagIcon iso2={props.data.iso2} />
      <span>+{props.data.dial} — {props.data.name}</span>
    </div>
  </components.SingleValue>
);

/* ---------- Component ---------- */
export default function ProfileInfo({
  userData,
  editing,
  profileForm,
  setProfileForm,
  setEditing,
  canEdit = false,
  handleSaveProfile,
  handleCancelEdit,
}) {
  /* Visibility */
  const getVisibility = (field) =>
    profileForm?.visibility?.[field] || userData?.visibility?.[field] || "public";
  const isHiddenFromViewer = (field) => getVisibility(field) === "private" && !canEdit;
  const togglePrivacy = (field) =>
    setProfileForm((prev) => ({
      ...prev,
      visibility: {
        ...(prev.visibility || {}),
        [field]: getVisibility(field) === "private" ? "public" : "private",
      },
    }));

  /* Phone (structured + legacy fallback) */
  const phoneCountry = profileForm.phoneCountry || userData?.phoneCountry || "US";
  const phoneNumber =
    profileForm.phoneNumber ?? userData?.phoneNumber ?? userData?.phone ?? "";
  const setPhoneCountry = (iso2) => setProfileForm({ ...profileForm, phoneCountry: iso2 });
  const setPhoneNumber = (val) => setProfileForm({ ...profileForm, phoneNumber: val });
  const formattedPhoneDisplay = () => {
    if (userData?.phoneCountry && (userData?.phoneNumber || userData?.phone)) {
      const c = COUNTRIES.find((x) => x.iso2 === userData.phoneCountry);
      const dial = c ? countryCallingCode(c.dial) : "";
      const num = userData.phoneNumber || userData.phone || "";
      return `+${dial} ${num}`;
    }
    if (userData?.phone) return userData.phone;
    return null;
  };

  /* UI helpers */
  const inputBase = {
    width: "100%",
    height: UI.inputH,
    padding: "0 12px",
    borderRadius: UI.radius,
    border: `1px solid ${UI.border}`,
    background: UI.bgSoft,
    color: UI.text,
    outline: "none",
  };
  const Label = ({ children }) => (
    <label style={{ color: UI.text, fontWeight: 700, fontSize: 13 }}>{children}</label>
  );
  const Pill = ({ field }) => {
    const priv = getVisibility(field) === "private";
    return editing ? (
      <button
        type="button"
        onClick={() => togglePrivacy(field)}
        style={{
          marginLeft: 8,
          height: 28,
          padding: "0 10px",
          borderRadius: 999,
          border: `1px solid ${UI.border}`,
          background: priv ? "rgba(255, 92, 92, 0.14)" : "rgba(44, 201, 182, 0.12)",
          color: priv ? UI.danger : UI.accent,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
        }}
        title={priv ? "Private (only you)" : "Public (everyone)"}
      >
        {priv ? "Private" : "Public"}
        <span aria-hidden>{priv ? "🔒" : "🌐"}</span>
      </button>
    ) : (
      <span
        style={{
          marginLeft: 8,
          height: 24,
          padding: "0 10px",
          borderRadius: 999,
          border: `1px solid ${UI.border}`,
          background: priv ? "rgba(255, 92, 92, 0.14)" : "rgba(44, 201, 182, 0.12)",
          color: priv ? UI.danger : UI.accent,
          fontSize: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {priv ? "Private" : "Public"} <span aria-hidden>{priv ? "🔒" : "🌐"}</span>
      </span>
    );
  };

  const FieldRow = ({
    label,
    field,
    type = "text",
    isSelect = false,
    selectOptions = [],
    renderEdit,
    renderView,
    placeholder,
  }) => {
    const value = profileForm?.[field] !== undefined ? profileForm[field] : userData?.[field];

    return (
      <div style={{ marginBottom: UI.gap + 6 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <Label>{label}</Label>
          <Pill field={field} />
        </div>

        {editing ? (
          renderEdit ? (
            renderEdit()
          ) : isSelect ? (
            <select
              value={profileForm[field] || ""}
              onChange={(e) => setProfileForm({ ...profileForm, [field]: e.target.value })}
              style={inputBase}
            >
              {selectOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={type}
              placeholder={placeholder}
              value={profileForm[field] || ""}
              onChange={(e) => setProfileForm({ ...profileForm, [field]: e.target.value })}
              style={inputBase}
            />
          )
        ) : isHiddenFromViewer(field) ? (
          <div style={{ color: UI.textSubtle, fontStyle: "italic" }}>Private</div>
        ) : renderView ? (
          renderView()
        ) : (
          <div style={{ color: UI.accent }}>
            {value || <small style={{ color: UI.textSubtle }}>Not provided</small>}
          </div>
        )}
      </div>
    );
  };

  const countryOptions = COUNTRIES.map(countryToOption);
  const selectedOption =
    countryOptions.find((o) => o.value === phoneCountry) ||
    countryOptions.find((o) => o.value === "US");

  return (
    <div style={{ display: "flex", marginTop: 64, padding: "0 20px", gap: 24 }}>
      <div style={{ flex: 2 }}>
        <div
          style={{
            padding: 18,
            border: `1px solid ${UI.border}`,
            borderRadius: 18,
            background: `linear-gradient(160deg, ${UI.bg} 0%, #072131 100%)`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 22, color: UI.accent, letterSpacing: 0.2 }}>
              Profile Card
            </h2>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {!editing ? (
                canEdit && (
                  <button
                    onClick={() => setEditing(true)}
                    style={{
                      height: UI.inputH,
                      padding: "0 14px",
                      borderRadius: UI.radius,
                      border: `1px solid ${UI.border}`,
                      background: UI.bgSoft,
                      color: UI.text,
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                )
              ) : (
                <>
                  <button
                    onClick={handleSaveProfile}
                    style={{
                      height: UI.inputH,
                      padding: "0 14px",
                      borderRadius: UI.radius,
                      border: `1px solid ${UI.border}`,
                      background: UI.accent,
                      color: "#06332b",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    style={{
                      height: UI.inputH,
                      padding: "0 14px",
                      borderRadius: UI.radius,
                      border: `1px solid ${UI.border}`,
                      background: UI.bgSoft,
                      color: UI.text,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 18,
              fontSize: 14,
            }}
          >
            {/* Column 1 */}
            <div>
              <FieldRow
                label="Phone"
                field="phone"
                renderEdit={() => (
                  <div style={{ display: "grid", gridTemplateColumns: "1.3fr 2.7fr", gap: UI.gap }}>
                    <Select
                      options={countryOptions}
                      value={selectedOption}
                      onChange={(opt) => setPhoneCountry(opt?.value || "US")}
                      components={{ Option, SingleValue, IndicatorSeparator: () => null }}
                      styles={{
                        control: (base, state) => ({
                          ...base,
                          minHeight: UI.inputH,
                          height: UI.inputH,
                          borderRadius: UI.radius,
                          borderColor: state.isFocused ? UI.borderHover : UI.border,
                          background: UI.bgSoft,
                          boxShadow: "none",
                        }),
                        menu: (base) => ({
                          ...base,
                          zIndex: 40,
                          background: UI.bgSoft,
                          border: `1px solid ${UI.border}`,
                        }),
                        option: (base, state) => ({
                          ...base,
                          background: state.isFocused ? "#123b56" : "transparent",
                          color: UI.text,
                          cursor: "pointer",
                        }),
                        singleValue: (base) => ({ ...base, color: UI.text }),
                        input: (base) => ({ ...base, color: UI.text }),
                        dropdownIndicator: (base) => ({ ...base, color: UI.textSubtle }),
                        valueContainer: (base) => ({ ...base, padding: "0 8px" }),
                      }}
                    />
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Phone number"
                      style={inputBase}
                      inputMode="tel"
                      autoComplete="tel-national"
                    />
                  </div>
                )}
                renderView={() =>
                  isHiddenFromViewer("phone") ? (
                    <div style={{ color: UI.textSubtle, fontStyle: "italic" }}>Private</div>
                  ) : formattedPhoneDisplay() ? (
                    <div style={{ color: UI.accent }}>
                      {flagEmoji(userData?.phoneCountry || "US")} {formattedPhoneDisplay()}
                    </div>
                  ) : (
                    <small style={{ color: UI.textSubtle }}>Not provided</small>
                  )
                }
              />

              <FieldRow
                label="Sex"
                field="sex"
                isSelect
                selectOptions={[
                  { value: "Male", label: "Male" },
                  { value: "Female", label: "Female" },
                  { value: "Other", label: "Other" },
                  { value: "Prefer not to say", label: "Prefer not to say" },
                ]}
              />

              <FieldRow label="Birthday" field="birthday" type="date" />
              <FieldRow label="Work" field="work" placeholder="Your role or company" />
            </div>

            {/* Column 2 */}
            <div>
              <FieldRow
                label="City"
                field="city"
                placeholder="City"
                renderView={() =>
                  isHiddenFromViewer("city") ? (
                    <div style={{ color: UI.textSubtle, fontStyle: "italic" }}>Private</div>
                  ) : userData?.city ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(userData.city)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#72c7ff", textDecoration: "none" }}
                    >
                      {userData.city}
                    </a>
                  ) : (
                    <small style={{ color: UI.textSubtle }}>Not provided</small>
                  )
                }
              />

              <FieldRow
                label="About Me"
                field="about"
                renderEdit={() => (
                  <textarea
                    value={profileForm.about || ""}
                    onChange={(e) => setProfileForm({ ...profileForm, about: e.target.value })}
                    rows={3}
                    placeholder="Tell people a bit about you…"
                    style={{ ...inputBase, height: 96, padding: 10, resize: "vertical" }}
                  />
                )}
              />

              <FieldRow label="Email" field="email" type="email" placeholder="you@example.com" />
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 16, color: UI.accent, fontSize: 16 }}>
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
