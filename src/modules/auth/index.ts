/**
 * Auth module — public surface ([קטגוריה 25] §25.3).
 */
export {
  login,
  logout,
  verifySession,
  setPassword,
  beginTotpEnrollment,
  confirmTotp,
  disableTotp,
  getTwoFactorStatus,
  getSsoConfig,
  setSsoConfig,
  loginViaSso,
  type SessionContext,
  type LoginResult,
  type TwoFactorRequired,
} from "./service";
