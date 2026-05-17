import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import attendeeRouter from "./attendee";
import selfServiceRouter from "./selfService";
import paymentsRouter from "./payments";
import attestationRouter from "./attestation";
import catalogueRouter from "./catalogue";
import ticketsRouter from "./tickets";
import guestListsRouter from "./guestLists";
import appleWalletRouter from "./appleWallet";
import posWalletSyncRouter from "./posWalletSync";
import cardsRouter from "./cards";
import adsRouter from "./ads";
import citiesRouter from "./cities";
import imageProxyRouter from "./imageProxy";
import watiWebhookRouter from "./watiWebhook";

const router: IRouter = Router();

router.use(imageProxyRouter);
router.use(watiWebhookRouter);
router.use(healthRouter);
router.use(authRouter);
router.use(attendeeRouter);
router.use(selfServiceRouter);
router.use(paymentsRouter);
router.use(attestationRouter);
router.use(catalogueRouter);
router.use(ticketsRouter);
router.use(guestListsRouter);
router.use(appleWalletRouter);
router.use(posWalletSyncRouter);
router.use(cardsRouter);
router.use(adsRouter);
router.use(citiesRouter);

export default router;
