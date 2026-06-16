// Pavé numérique 4x4 via GPIO (Raspberry Pi)
// Repose sur onoff. Passe en mode simulation si indisponible.

const LIGNES_PINS = [17, 27, 22, 5]
const COLS_PINS   = [6, 13, 19, 26]

const TOUCHES = [
  ['1','2','3','A'],
  ['4','5','6','B'],
  ['7','8','9','C'],
  ['*','0','#','D'],
]

let Gpio = null
let lignes = []
let cols   = []
let disponible = false

async function initKeypad() {
  try {
    const { Gpio: G } = await import('onoff')
    Gpio = G
    lignes = LIGNES_PINS.map(p => new Gpio(p, 'out'))
    cols   = COLS_PINS.map(p => new Gpio(p, 'in', 'falling', { debounceTimeout: 10 }))
    disponible = true
    console.log('[Keypad] Pavé numérique initialisé.')
    return true
  } catch {
    console.warn('[Keypad] Module GPIO non disponible — saisie physique désactivée.')
    return false
  }
}

// Lit la touche pressée (bloquant synchrone, à appeler en boucle)
function lireTouche() {
  if (!disponible) return null
  for (let r = 0; r < lignes.length; r++) {
    lignes.forEach(l => l.writeSync(1))
    lignes[r].writeSync(0)
    for (let c = 0; c < cols.length; c++) {
      if (cols[c].readSync() === 0) {
        lignes.forEach(l => l.writeSync(1))
        return TOUCHES[r][c]
      }
    }
    lignes[r].writeSync(1)
  }
  return null
}

// Collecte un code PIN de longueur fixe (4 chiffres)
// onTouche(char) est appelé à chaque frappe pour donner un feedback visuel
// Retourne une Promise<string> quand la longueur est atteinte
function saisirPIN(longueur = 4, onTouche = () => {}) {
  return new Promise((resolve) => {
    if (!disponible) return // mode simulation : rien à faire

    let code = ''
    const intervalle = setInterval(() => {
      const t = lireTouche()
      if (!t) return
      if (t === '*') { code = ''; onTouche('reset') }
      else if (/[0-9]/.test(t)) {
        code += t
        onTouche(t)
        if (code.length >= longueur) {
          clearInterval(intervalle)
          resolve(code)
        }
      }
    }, 50)
  })
}

function libererKeypad() {
  lignes.forEach(l => l.unexport())
  cols.forEach(c => c.unexport())
}

export { initKeypad, lireTouche, saisirPIN, libererKeypad }
