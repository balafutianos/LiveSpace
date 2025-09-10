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

// Dropdown-only config
const MENU_W = {
  size: 260,              // width in px
  textcolor: "#2cc9b6",   // option text color
  backgroundcolor: "#0f1c24", // menu background (add the #)
};



const COUNTRIES = [
  { name: "Afghanistan", iso2: "AF", dial: "93" },
  { name: "Albania", iso2: "AL", dial: "355" },
  { name: "Algeria", iso2: "DZ", dial: "213" },
  { name: "Andorra", iso2: "AD", dial: "376" },
  { name: "Angola", iso2: "AO", dial: "244" },
  { name: "Antigua and Barbuda", iso2: "AG", dial: "1-268" },
  { name: "Argentina", iso2: "AR", dial: "54" },
  { name: "Armenia", iso2: "AM", dial: "374" },
  { name: "Australia", iso2: "AU", dial: "61" },
  { name: "Austria", iso2: "AT", dial: "43" },
  { name: "Azerbaijan", iso2: "AZ", dial: "994" },
  { name: "Bahamas", iso2: "BS", dial: "1-242" },
  { name: "Bahrain", iso2: "BH", dial: "973" },
  { name: "Bangladesh", iso2: "BD", dial: "880" },
  { name: "Barbados", iso2: "BB", dial: "1-246" },
  { name: "Belarus", iso2: "BY", dial: "375" },
  { name: "Belgium", iso2: "BE", dial: "32" },
  { name: "Belize", iso2: "BZ", dial: "501" },
  { name: "Benin", iso2: "BJ", dial: "229" },
  { name: "Bhutan", iso2: "BT", dial: "975" },
  { name: "Bolivia", iso2: "BO", dial: "591" },
  { name: "Bosnia and Herzegovina", iso2: "BA", dial: "387" },
  { name: "Botswana", iso2: "BW", dial: "267" },
  { name: "Brazil", iso2: "BR", dial: "55" },
  { name: "Brunei", iso2: "BN", dial: "673" },
  { name: "Bulgaria", iso2: "BG", dial: "359" },
  { name: "Burkina Faso", iso2: "BF", dial: "226" },
  { name: "Burundi", iso2: "BI", dial: "257" },
  { name: "Cabo Verde", iso2: "CV", dial: "238" },
  { name: "Cambodia", iso2: "KH", dial: "855" },
  { name: "Cameroon", iso2: "CM", dial: "237" },
  { name: "Canada", iso2: "CA", dial: "1" },
  { name: "Central African Republic", iso2: "CF", dial: "236" },
  { name: "Chad", iso2: "TD", dial: "235" },
  { name: "Chile", iso2: "CL", dial: "56" },
  { name: "China", iso2: "CN", dial: "86" },
  { name: "Colombia", iso2: "CO", dial: "57" },
  { name: "Comoros", iso2: "KM", dial: "269" },
  { name: "Congo (Republic)", iso2: "CG", dial: "242" },
  { name: "Congo (Democratic Republic)", iso2: "CD", dial: "243" },
  { name: "Costa Rica", iso2: "CR", dial: "506" },
  { name: "Croatia", iso2: "HR", dial: "385" },
  { name: "Cuba", iso2: "CU", dial: "53" },
  { name: "Cyprus", iso2: "CY", dial: "357" },
  { name: "Czechia", iso2: "CZ", dial: "420" },
  { name: "Denmark", iso2: "DK", dial: "45" },
  { name: "Djibouti", iso2: "DJ", dial: "253" },
  { name: "Dominica", iso2: "DM", dial: "1-767" },
  { name: "Dominican Republic", iso2: "DO", dial: "1-809 / 1-829 / 1-849" },
  { name: "Ecuador", iso2: "EC", dial: "593" },
  { name: "Egypt", iso2: "EG", dial: "20" },
  { name: "El Salvador", iso2: "SV", dial: "503" },
  { name: "Equatorial Guinea", iso2: "GQ", dial: "240" },
  { name: "Eritrea", iso2: "ER", dial: "291" },
  { name: "Estonia", iso2: "EE", dial: "372" },
  { name: "Eswatini", iso2: "SZ", dial: "268" },
  { name: "Ethiopia", iso2: "ET", dial: "251" },
  { name: "Fiji", iso2: "FJ", dial: "679" },
  { name: "Finland", iso2: "FI", dial: "358" },
  { name: "France", iso2: "FR", dial: "33" },
  { name: "Gabon", iso2: "GA", dial: "241" },
  { name: "Gambia", iso2: "GM", dial: "220" },
  { name: "Georgia", iso2: "GE", dial: "995" },
  { name: "Germany", iso2: "DE", dial: "49" },
  { name: "Ghana", iso2: "GH", dial: "233" },
  { name: "Greece", iso2: "GR", dial: "30" },
  { name: "Grenada", iso2: "GD", dial: "1-473" },
  { name: "Guatemala", iso2: "GT", dial: "502" },
  { name: "Guinea", iso2: "GN", dial: "224" },
  { name: "Guinea-Bissau", iso2: "GW", dial: "245" },
  { name: "Guyana", iso2: "GY", dial: "592" },
  { name: "Haiti", iso2: "HT", dial: "509" },
  { name: "Honduras", iso2: "HN", dial: "504" },
  { name: "Hungary", iso2: "HU", dial: "36" },
  { name: "Iceland", iso2: "IS", dial: "354" },
  { name: "India", iso2: "IN", dial: "91" },
  { name: "Indonesia", iso2: "ID", dial: "62" },
  { name: "Iran", iso2: "IR", dial: "98" },
  { name: "Iraq", iso2: "IQ", dial: "964" },
  { name: "Ireland", iso2: "IE", dial: "353" },
  { name: "Israel", iso2: "IL", dial: "972" },
  { name: "Italy", iso2: "IT", dial: "39" },
  { name: "Jamaica", iso2: "JM", dial: "1-876" },
  { name: "Japan", iso2: "JP", dial: "81" },
  { name: "Jordan", iso2: "JO", dial: "962" },
  { name: "Kazakhstan", iso2: "KZ", dial: "7" },
  { name: "Kenya", iso2: "KE", dial: "254" },
  { name: "Kiribati", iso2: "KI", dial: "686" },
  { name: "Korea, North", iso2: "KP", dial: "850" },
  { name: "Korea, South", iso2: "KR", dial: "82" },
  { name: "Kosovo", iso2: "XK", dial: "383" },
  { name: "Kuwait", iso2: "KW", dial: "965" },
  { name: "Kyrgyzstan", iso2: "KG", dial: "996" },
  { name: "Laos", iso2: "LA", dial: "856" },
  { name: "Latvia", iso2: "LV", dial: "371" },
  { name: "Lebanon", iso2: "LB", dial: "961" },
  { name: "Lesotho", iso2: "LS", dial: "266" },
  { name: "Liberia", iso2: "LR", dial: "231" },
  { name: "Libya", iso2: "LY", dial: "218" },
  { name: "Liechtenstein", iso2: "LI", dial: "423" },
  { name: "Lithuania", iso2: "LT", dial: "370" },
  { name: "Luxembourg", iso2: "LU", dial: "352" },
  { name: "Madagascar", iso2: "MG", dial: "261" },
  { name: "Malawi", iso2: "MW", dial: "265" },
  { name: "Malaysia", iso2: "MY", dial: "60" },
  { name: "Maldives", iso2: "MV", dial: "960" },
  { name: "Mali", iso2: "ML", dial: "223" },
  { name: "Malta", iso2: "MT", dial: "356" },
  { name: "Marshall Islands", iso2: "MH", dial: "692" },
  { name: "Mauritania", iso2: "MR", dial: "222" },
  { name: "Mauritius", iso2: "MU", dial: "230" },
  { name: "Mexico", iso2: "MX", dial: "52" },
  { name: "Micronesia", iso2: "FM", dial: "691" },
  { name: "Moldova", iso2: "MD", dial: "373" },
  { name: "Monaco", iso2: "MC", dial: "377" },
  { name: "Mongolia", iso2: "MN", dial: "976" },
  { name: "Montenegro", iso2: "ME", dial: "382" },
  { name: "Morocco", iso2: "MA", dial: "212" },
  { name: "Mozambique", iso2: "MZ", dial: "258" },
  { name: "Myanmar", iso2: "MM", dial: "95" },
  { name: "Namibia", iso2: "NA", dial: "264" },
  { name: "Nauru", iso2: "NR", dial: "674" },
  { name: "Nepal", iso2: "NP", dial: "977" },
  { name: "Netherlands", iso2: "NL", dial: "31" },
  { name: "New Zealand", iso2: "NZ", dial: "64" },
  { name: "Nicaragua", iso2: "NI", dial: "505" },
  { name: "Niger", iso2: "NE", dial: "227" },
  { name: "Nigeria", iso2: "NG", dial: "234" },
  { name: "Norway", iso2: "NO", dial: "47" },
  { name: "Oman", iso2: "OM", dial: "968" },
  { name: "Pakistan", iso2: "PK", dial: "92" },
  { name: "Palau", iso2: "PW", dial: "680" },
  { name: "Panama", iso2: "PA", dial: "507" },
  { name: "Papua New Guinea", iso2: "PG", dial: "675" },
  { name: "Paraguay", iso2: "PY", dial: "595" },
  { name: "Peru", iso2: "PE", dial: "51" },
  { name: "Philippines", iso2: "PH", dial: "63" },
  { name: "Poland", iso2: "PL", dial: "48" },
  { name: "Portugal", iso2: "PT", dial: "351" },
  { name: "Qatar", iso2: "QA", dial: "974" },
  { name: "Romania", iso2: "RO", dial: "40" },
  { name: "Russia", iso2: "RU", dial: "7" },
  { name: "Rwanda", iso2: "RW", dial: "250" },
  { name: "Saint Kitts and Nevis", iso2: "KN", dial: "1-869" },
  { name: "Saint Lucia", iso2: "LC", dial: "1-758" },
  { name: "Saint Vincent and the Grenadines", iso2: "VC", dial: "1-784" },
  { name: "Samoa", iso2: "WS", dial: "685" },
  { name: "San Marino", iso2: "SM", dial: "378" },
  { name: "Sao Tome and Principe", iso2: "ST", dial: "239" },
  { name: "Saudi Arabia", iso2: "SA", dial: "966" },
  { name: "Senegal", iso2: "SN", dial: "221" },
  { name: "Skopje", iso2: "MK", dial: "389" },
  { name: "Serbia", iso2: "RS", dial: "381" },
  { name: "Seychelles", iso2: "SC", dial: "248" },
  { name: "Sierra Leone", iso2: "SL", dial: "232" },
  { name: "Singapore", iso2: "SG", dial: "65" },
  { name: "Slovakia", iso2: "SK", dial: "421" },
  { name: "Slovenia", iso2: "SI", dial: "386" },
  { name: "Solomon Islands", iso2: "SB", dial: "677" },
  { name: "Somalia", iso2: "SO", dial: "252" },
  { name: "South Africa", iso2: "ZA", dial: "27" },
  { name: "South Sudan", iso2: "SS", dial: "211" },
  { name: "Spain", iso2: "ES", dial: "34" },
  { name: "Sri Lanka", iso2: "LK", dial: "94" },
  { name: "Sudan", iso2: "SD", dial: "249" },
  { name: "Suriname", iso2: "SR", dial: "597" },
  { name: "Sweden", iso2: "SE", dial: "46" },
  { name: "Switzerland", iso2: "CH", dial: "41" },
  { name: "Syria", iso2: "SY", dial: "963" },
  { name: "Taiwan", iso2: "TW", dial: "886" },
  { name: "Tajikistan", iso2: "TJ", dial: "992" },
  { name: "Tanzania", iso2: "TZ", dial: "255" },
  { name: "Thailand", iso2: "TH", dial: "66" },
  { name: "Timor-Leste", iso2: "TL", dial: "670" },
  { name: "Togo", iso2: "TG", dial: "228" },
  { name: "Tonga", iso2: "TO", dial: "676" },
  { name: "Trinidad and Tobago", iso2: "TT", dial: "1-868" },
  { name: "Tunisia", iso2: "TN", dial: "216" },
  { name: "Turkey", iso2: "TR", dial: "90" },
  { name: "Turkmenistan", iso2: "TM", dial: "993" },
  { name: "Tuvalu", iso2: "TV", dial: "688" },
  { name: "Uganda", iso2: "UG", dial: "256" },
  { name: "Ukraine", iso2: "UA", dial: "380" },
  { name: "United Arab Emirates", iso2: "AE", dial: "971" },
  { name: "United Kingdom", iso2: "GB", dial: "44" },
  { name: "United States", iso2: "US", dial: "1" },
  { name: "Uruguay", iso2: "UY", dial: "598" },
  { name: "Uzbekistan", iso2: "UZ", dial: "998" },
  { name: "Vanuatu", iso2: "VU", dial: "678" },
  { name: "Vatican City", iso2: "VA", dial: "379" },
  { name: "Venezuela", iso2: "VE", dial: "58" },
  { name: "Vietnam", iso2: "VN", dial: "84" },
  { name: "Yemen", iso2: "YE", dial: "967" },
  { name: "Zambia", iso2: "ZM", dial: "260" },
  { name: "Zimbabwe", iso2: "ZW", dial: "263" },
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
            padding: 4,
            border: `1px solid ${UI.border}`,
            borderRadius: 18,
            background: `linear-gradient(160deg, ${UI.bg} 0%, #072131 100%)`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            marginLeft: "-38px",
            marginTop: "-63px",
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

  /* render menu outside the card so it isn't clipped */
  menuPortalTarget={typeof document !== "undefined" ? document.body : null}
  menuPosition="fixed"

  styles={{
    control: (base, state) => ({
      ...base,
      minHeight: UI.inputH,        // keep closed control size the same
      height: UI.inputH,
      borderRadius: UI.radius,
      borderColor: state.isFocused ? UI.borderHover : UI.border,
      background: UI.bgSoft,
      boxShadow: "none",
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999,
    }),
    /* 👉 ONLY the open dropdown panel width/color */
    menu: (base) => ({
      ...base,
      zIndex: 9999,
      width: MENU_W.size,
      minWidth: MENU_W.size,
      maxWidth: "min(95vw, 720px)",
      background: MENU_W.backgroundcolor,
      border: `1px solid ${UI.border}`,
    }),
    menuList: (base) => ({
      ...base,
      padding: 6,
      background: MENU_W.backgroundcolor,
      maxHeight: 320,              // scroll height inside the menu
    }),
    option: (base, state) => ({
      ...base,
      color: MENU_W.textcolor,     // country name color
      background: state.isFocused ? "#123b56" : "transparent",
      cursor: "pointer",
      /* leave font/padding as-is to keep your look */
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
