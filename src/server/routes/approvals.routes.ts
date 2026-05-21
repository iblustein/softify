import { Router } from "express";
import * as approvalService from "../services/approval.service.js";

const router = Router();

router.get("/approvals", (req, res) => {
  try {
    const queue = approvalService.getApprovals();
    res.json(queue);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/approvals/:id/decide", (req, res) => {
  const { id } = req.params;
  const { decision } = req.body;
  try {
    const updatedItem = approvalService.decideApproval(id, decision);
    res.json(updatedItem);
  } catch (error: any) {
    const isNotFound = error.message === "Approval item not found";
    const isBadReq = error.message === "Action is already finalized.";
    res.status(isNotFound ? 404 : isBadReq ? 400 : 500).json({ error: error.message });
  }
});

export default router;
