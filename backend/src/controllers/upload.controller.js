import { imageUploadService } from '../services/uploads/imageUpload.service.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const uploadController = {
  image: asyncHandler(async (req, res) => {
    sendSuccess(res, await imageUploadService.upload(req.user, req.file), 'Image uploaded', 201)
  }),
}
