import { materialService } from '../services/materials/material.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const materialController = {
  listByTopic: asyncHandler(async (req, res) => {
    sendSuccess(res, await materialService.listByTopic(req.user, req.params.id))
  }),

  create: asyncHandler(async (req, res) => {
    sendSuccess(res, await materialService.create(req.user, req.params.id, req.body, req.file), 'Material uploaded', 201)
  }),

  getById: asyncHandler(async (req, res) => {
    sendSuccess(res, await materialService.getById(req.user, req.params.id))
  }),

  update: asyncHandler(async (req, res) => {
    sendSuccess(res, await materialService.update(req.user, req.params.id, req.body), 'Material updated')
  }),

  remove: asyncHandler(async (req, res) => {
    await materialService.remove(req.user, req.params.id)
    sendSuccess(res, null, 'Material deleted')
  }),
}
