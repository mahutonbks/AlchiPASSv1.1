// Lecteur RFID RC522 via SPI (GPIO Raspberry Pi)
// Si le module pigpio n'est pas disponible (dev sur PC), passe en mode simulation.

let mfrc522 = null

async function initRFID() {
  try {
    const { default: Mfrc522 } = await import('mfrc522-rpi')
    const { default: SoftSPI } = await import('rpi-softspi')
    const softSPI = new SoftSPI({
      clock: 23, mosi: 19, miso: 21, client: 24,
    })
    mfrc522 = new Mfrc522(softSPI).setResetPin(22).setBuzzerPin(18)
    console.log('[RFID] Module RC522 initialisé.')
    return true
  } catch {
    console.warn('[RFID] Module RFID non disponible — mode simulation activé.')
    return false
  }
}

// Lit un badge et retourne son UID (string hex) ou null si rien
function lireUID() {
  if (!mfrc522) return null
  try {
    mfrc522.reset()
    const response = mfrc522.findCard()
    if (!response.status) return null

    const uid = mfrc522.getUid()
    if (!uid.status) return null

    const hex = uid.data.slice(0, 4).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('')
    mfrc522.stopCrypto()
    return hex
  } catch {
    return null
  }
}

// Boucle de polling — appelle onBadge(uid) dès qu'un badge est détecté
// Retourne la fonction stop() pour arrêter la boucle
function demarrerPolling(onBadge, intervalMs = 200) {
  let actif = true
  let dernierUID = null
  let dernierTemps = 0

  async function boucle() {
    while (actif) {
      const uid = lireUID()
      const now = Date.now()
      if (uid && (uid !== dernierUID || now - dernierTemps > 2000)) {
        dernierUID = uid
        dernierTemps = now
        try { onBadge(uid) } catch (e) { console.error('[RFID] Erreur callback:', e) }
      }
      await new Promise(r => setTimeout(r, intervalMs))
    }
  }

  boucle()
  return () => { actif = false }
}

export { initRFID, lireUID, demarrerPolling }
