import { Router }               from "express";
import { login, logout }        from "../controllers/login.controller";
import { refreshAccessToken }   from "../controllers/refreshToken.controller";
import { authLimiter, refreshLimiter } from "../middleware/rateLimiter.middleware";
import verifyToken              from "../middleware/auth.middleware";
import { checkLockout }         from "../middleware/loginLockout.middleware";

const router = Router();

router.post("/login",              authLimiter,    checkLockout, login);
router.post("/auth/refresh_token", refreshLimiter, refreshAccessToken);
router.post("/logout",             verifyToken,    logout);

export default router;