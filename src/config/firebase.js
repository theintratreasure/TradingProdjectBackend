import admin from 'firebase-admin'
import fs from 'fs'
import path from 'path'

const serviceAccountPath = path.join(
  process.cwd(),
  'firebase-admin-key.json'
)

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error('Firebase service account key not found')
}

const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, 'utf-8')
)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

export default admin
