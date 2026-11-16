import { S, $, esc, icon, logoImg } from "../core.js";
import { t, getLang, setLang } from "../i18n.js";
import { api } from "../api.js";
import { errText, hooks } from "../store.js";

export function renderAuth() {
  const mode = S.ui.authMode;
  const up = mode === "signup";
  document.documentElement.classList.add("auth-mode");
  $("root").innerHTML = `<div class="auth">
    <section class="auth-brand-panel" aria-hidden="true">
      <div class="ab-glow g1"></div><div class="ab-glow g2"></div>
      <div class="ab-inner">
        <div class="ab-logo">${logoImg(64)}<b>Tempo</b></div>
        <h2>${t("auth.heroTitle")}</h2>
        <p>${t("auth.heroText")}</p>
        <ul class="ab-points">
          <li>${icon("gantt", 18)}<span>${t("auth.point1")}</span></li>
          <li>${icon("star", 18)}<span>${t("auth.point2")}</span></li>
          <li>${icon("users", 18)}<span>${t("auth.point3")}</span></li>
        </ul>
        <div class="ab-cards">
          <div class="ab-card c1"><span class="pill c-green">● ${t("collabStatus.posted")}</span><b>@sample.creator</b><small>5.1M · TikTok</small></div>
          <div class="ab-card c2"><span class="dot c-violet"></span><b>${t("auth.sampleCampaign")}</b><div class="bar"><i style="width:68%"></i></div></div>
        </div>
      </div>
    </section>
    <section class="auth-form-panel">
      <div class="auth-top">
        <button type="button" class="lang-btn" data-act="authLang" aria-label="Language">${icon("globe", 16)}${getLang() === "th" ? "EN" : "ไทย"}</button>
      </div>
      <div class="auth-card">
        <div class="auth-head">${logoImg(56, "only-compact")}<h1>${t(up ? "auth.createTitle" : "auth.welcome")}</h1><p>${t(up ? "auth.createSub" : "auth.welcomeSub")}</p></div>
        <div class="seg full" role="tablist"><button type="button" data-act="authMode" data-v="signin" aria-pressed="${!up}">${t("auth.signIn")}</button><button type="button" data-act="authMode" data-v="signup" aria-pressed="${up}">${t("auth.signUp")}</button></div>
        <div class="auth-error" id="authError" role="alert" ${S.ui.authError ? "" : "hidden"}>${icon("alert", 16)}<span>${esc(S.ui.authError)}</span></div>
        <form id="authForm" novalidate>
          <div class="fgroup">
            ${up ? `<div class="field-pair"><label class="field"><span>${icon("user", 18)}</span><input name="first_name" placeholder="${t("auth.firstName")}" autocomplete="given-name" required maxlength="60"></label><label class="field"><input name="last_name" placeholder="${t("auth.lastName")}" autocomplete="family-name" required maxlength="60"></label></div>` : ""}
            <label class="field"><span>${icon("mail", 18)}</span><input name="email" type="email" placeholder="${t("auth.email")}" autocomplete="email" required inputmode="email"></label>
            <label class="field"><span>${icon("lock", 18)}</span><input name="password" id="authPw" type="password" placeholder="${t("auth.password")}" autocomplete="${up ? "new-password" : "current-password"}" required minlength="${up ? 8 : 1}"><button type="button" class="pw-toggle" data-act="togglePw" aria-label="${t("auth.showPw")}">${icon("eye", 18)}</button></label>
          </div>
          <div class="auth-row">${up ? `<span class="faint small">${t("auth.pwHint")}${S.config.signup === false ? " · " + t("auth.inviteOnly") : ""}</span>` : `<label class="remember"><span class="switch sm"><input type="checkbox" name="remember" checked><span></span></span>${t("auth.remember")}</label>`}</div>
          <button class="btn filled lg" type="submit" id="authSubmit">${t(up ? "auth.createBtn" : "auth.signInBtn")}</button>
        </form>
        <p class="auth-note">${icon("lock", 13)}${t(up ? "auth.noteSignup" : "auth.noteSignin")}</p>
      </div>
      <p class="auth-foot">© ${new Date().getFullYear()} Tempo</p>
    </section>
  </div>`;
  setTimeout(() => $("authForm")?.elements[up ? "first_name" : "email"]?.focus({ preventScroll: true }), 60);
}

function showError(msg) {
  S.ui.authError = msg;
  const box = $("authError");
  if (box) { box.hidden = !msg; box.querySelector("span").textContent = msg; }
}

export async function submitAuth(form) {
  const fd = Object.fromEntries(new FormData(form));
  const up = S.ui.authMode === "signup";
  if (up && !String(fd.first_name || "").trim()) return showError(t("err.first_name_required"));
  if (up && !String(fd.last_name || "").trim()) return showError(t("err.last_name_required"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(fd.email || "").trim())) return showError(t("err.email_invalid"));
  if (up && String(fd.password || "").length < 8) return showError(t("err.weak_password"));
  if (!fd.password) return showError(t("err.required"));
  const btn = $("authSubmit"); btn.disabled = true; btn.classList.add("loading");
  try {
    const r = up
      ? await api("POST", "/auth/register", { first_name: fd.first_name, last_name: fd.last_name, email: fd.email, password: fd.password, lang: getLang(), remember: true })
      : await api("POST", "/auth/login", { email: fd.email, password: fd.password, remember: !!fd.remember });
    S.ui.authError = "";
    await hooks.signedIn(r, up ? t("toast.welcomeNew", { name: r.user.name }) : t("toast.welcomeBack", { name: r.user.name }));
  } catch (e) {
    showError(errText(e));
  } finally { if ($("authSubmit")) { $("authSubmit").disabled = false; $("authSubmit").classList.remove("loading"); } }
}

export const authActions = {
  authMode: el => { S.ui.authMode = el.dataset.v; S.ui.authError = ""; renderAuth(); },
  authLang: () => { setLang(getLang() === "th" ? "en" : "th"); renderAuth(); },
  togglePw: el => { const i = $("authPw"); i.type = i.type === "password" ? "text" : "password"; el.innerHTML = icon(i.type === "password" ? "eye" : "eyeOff", 18); }
};
