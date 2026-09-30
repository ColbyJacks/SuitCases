/** Webcam helpers for the ID Forge. */

export async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera needs localhost or HTTPS in a modern browser')
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  })
}

export function closeCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop())
}

/**
 * Grab the current video frame, mirrored so it matches the selfie preview,
 * center-cropped to the given aspect ratio (w / h).
 */
export function snapshot(video: HTMLVideoElement, aspect: number): HTMLCanvasElement {
  const vw = video.videoWidth
  const vh = video.videoHeight
  let sw = vw
  let sh = vw / aspect
  if (sh > vh) {
    sh = vh
    sw = vh * aspect
  }
  const c = document.createElement('canvas')
  c.width = Math.round(sw)
  c.height = Math.round(sh)
  const g = c.getContext('2d')!
  g.translate(c.width, 0)
  g.scale(-1, 1)
  g.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height)
  return c
}

/** Load a user-picked image file, for when there's no camera. */
export function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image'))
    }
    img.src = url
  })
}
