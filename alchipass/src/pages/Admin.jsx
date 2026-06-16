// =============================================================
//  Admin.jsx — Espace manager / RH avec navigation latérale.
//  Rôle 'rh'    → Récapitulatifs, Corrections, Salariés, Planning.
//  Rôle 'admin' → Présence temps réel, Conformité EPI, Salariés, Anomalies.
// =============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { BarreHaut } from '../components/Communs'
import {
  dateKey,
  etatSalarie,
  formatHeure,
  formatDuree,
  calculerJournee,
  joursDeLaSemaine,
  nomJourCourt,
  LIBELLE_ACTION,
} from '../utils/time'
import {
  totalSemaine,
  detecterAnomalies,
  exporterCSVSemaine,
  telechargerCSV,
} from '../utils/rapports'

const VUES_RH = [
  { id: 'recap',     label: 'Récapitulatifs & export', icone: '🧮' },
  { id: 'pointages', label: 'Corrections & oublis',    icone: '🕑' },
  { id: 'salaries',  label: 'Salariés',                icone: '👥' },
  { id: 'planning',  label: 'Planning',                icone: '📅' },
  { id: 'feedbacks', label: 'Feedbacks salariés',      icone: '⭐' },
]

const VUES_ADMIN = [
  { id: 'bord',     label: 'Présence en temps réel',   icone: '📊' },
  { id: 'securite', label: 'Conformité EPI',           icone: '🦺' },
  { id: 'casques',  label: 'Casques & RFID',           icone: '📡' },
  { id: 'salaries', label: 'Salariés',                 icone: '👥' },
  { id: 'anomalies',label: 'Anomalies',                icone: '⚠️' },
]

export default function Admin({ role, onDeconnexion }) {
  const navigate = useNavigate()
  const app = useApp()
  const vues = role === 'rh' ? VUES_RH : VUES_ADMIN
  const [vue, setVue] = useState(vues[0].id)
  const [sidebarExpandee, setSidebarExpandee] = useState(true)

  // Sidebar réduite par défaut sous 900px, déployée sur desktop
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const syncSidebar = (e) => setSidebarExpandee(!e.matches)
    syncSidebar(mq)
    mq.addEventListener('change', syncSidebar)
    return () => mq.removeEventListener('change', syncSidebar)
  }, [])

  function deconnecter() {
    onDeconnexion()
    navigate('/')
  }

  const titreRole = role === 'rh' ? 'Espace RH' : 'Espace Admin · Sécurité'
  const badgeRole = role === 'rh' ? '👤 RH' : '🔐 Admin'

  return (
    <div className="app-shell">
      <BarreHaut
        titre={titreRole}
        droite={<button className="btn gris mini" onClick={deconnecter}>Déconnexion</button>}
      />

      <div className="admin-layout">
        {/* ---- Navigation latérale ---- */}
        <nav
          className={`admin-sidebar ${sidebarExpandee ? 'admin-sidebar--ouverte' : 'admin-sidebar--mini'}`}
          aria-label="Navigation principale"
        >
          {/* Bouton hamburger / fermer */}
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarExpandee(v => !v)}
            aria-label={sidebarExpandee ? 'Réduire le menu' : 'Ouvrir le menu'}
            title={sidebarExpandee ? 'Réduire' : 'Ouvrir'}
          >
            {sidebarExpandee ? '✕' : '☰'}
          </button>

          <div className="sidebar-role">
            <span className={`role-badge-mini ${role}`}>
              {sidebarExpandee ? badgeRole : (role === 'rh' ? '👤' : '🔐')}
            </span>
          </div>

          {vues.map((v) => (
            <button
              key={v.id}
              className={`sidebar-item ${vue === v.id ? 'actif' : ''}`}
              onClick={() => setVue(v.id)}
              title={!sidebarExpandee ? v.label : undefined}
            >
              <span className="sidebar-icone">{v.icone}</span>
              {sidebarExpandee && <span className="sidebar-label">{v.label}</span>}
            </button>
          ))}
        </nav>

        {/* ---- Contenu principal ---- */}
        <main className="admin-contenu" key={vue}>
          {vue === 'bord'      && <TableauBord app={app} />}
          {vue === 'recap'     && <Recapitulatifs app={app} />}
          {vue === 'salaries'  && <GestionSalaries app={app} />}
          {vue === 'pointages' && <GestionPointages app={app} />}
          {vue === 'planning'  && <GestionPlanning app={app} />}
          {vue === 'feedbacks' && <VueFeedbacks app={app} />}
          {vue === 'anomalies' && <Anomalies app={app} />}
          {vue === 'securite'  && <DashboardSecurite app={app} />}
          {vue === 'casques'   && <GestionCasques app={app} />}
        </main>
      </div>

      <div className="rgpd">
        🔒 Données de pointage personnelles (RGPD) — accessibles uniquement au salarié concerné et aux managers.
        <button
          className="retour"
          style={{ marginLeft: 8, color: 'var(--vert-fonce)' }}
          onClick={() => {
            if (confirm('Réinitialiser toutes les données aux valeurs de démonstration ?')) app.reinitialiserDemo()
          }}
        >
          Réinitialiser la démo
        </button>
      </div>
    </div>
  )
}

// =============================================================
//  TABLEAU DE BORD TEMPS RÉEL
// =============================================================
function TableauBord({ app }) {
  const { salaries, sites, pointages } = app
  const [filtreSite, setFiltreSite] = useState('tous')
  const cleJour = dateKey(new Date())

  const parSalarie = useMemo(() => {
    const m = {}
    for (const p of pointages) if (p.cle === cleJour) (m[p.salarieId] ||= []).push(p)
    return m
  }, [pointages, cleJour])

  const actifs = salaries.filter((s) => s.actif && (filtreSite === 'tous' || s.siteId === filtreSite))
  const compte = { present: 0, en_pause: 0, parti: 0, absent: 0 }
  actifs.forEach((s) => { compte[etatSalarie(parSalarie[s.id] || [])]++ })
  const nomSite = (id) => sites.find((x) => x.id === id)?.nom || ''

  return (
    <div className="grille" style={{ gap: 18 }}>
      <div className="flex between wrap">
        <h2 style={{ margin: 0 }}>Présence en temps réel</h2>
        <select style={{ width: 220 }} value={filtreSite} onChange={(e) => setFiltreSite(e.target.value)}>
          <option value="tous">Tous les sites</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
      </div>

      <div className="grille k4">
        <div className="kpi"><div className="v vert">{compte.present}</div><div className="l">Sur site</div></div>
        <div className="kpi"><div className="v orange">{compte.en_pause}</div><div className="l">En pause</div></div>
        <div className="kpi"><div className="v bleu">{compte.parti}</div><div className="l">Partis</div></div>
        <div className="kpi"><div className="v" style={{ color: 'var(--texte-doux)' }}>{compte.absent}</div><div className="l">Pas encore arrivés</div></div>
      </div>

      <div className="carte">
        <table>
          <thead>
            <tr><th>Salarié</th><th>Site</th><th>État</th><th>Dernier pointage</th><th>Temps travaillé</th></tr>
          </thead>
          <tbody>
            {actifs.map((s) => {
              const pts = (parSalarie[s.id] || []).slice().sort((a, b) => a.timestamp - b.timestamp)
              const etat = etatSalarie(pts)
              const dernier = pts[pts.length - 1]
              const r = calculerJournee(pts)
              return (
                <tr key={s.id}>
                  <td><strong>{s.avatar} {s.prenom} {s.nom}</strong></td>
                  <td>{nomSite(s.siteId)}</td>
                  <td><span className={`etat ${etat}`}><span className={`pastille ${etat}`} />{etiquetteEtat(etat)}</span></td>
                  <td>{dernier ? `${LIBELLE_ACTION[dernier.type]} · ${formatHeure(dernier.timestamp)}` : '—'}</td>
                  <td>{pts.length ? formatDuree(r.minutesTravaillees) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// =============================================================
//  DASHBOARD SÉCURITÉ / CONFORMITÉ EPI
// =============================================================
function DashboardSecurite({ app }) {
  const { salaries, sites, pointages, signalements = [], signalerRenouvellementEPI, marquerSignalementTraite } = app
  const cleJour = dateKey(new Date())

  // Calcul du statut EPI de chaque salarié actif pour aujourd'hui.
  const statutsEPI = useMemo(() => {
    return salaries.filter((s) => s.actif).map((s) => {
      const pts = pointages
        .filter((p) => p.salarieId === s.id && p.cle === cleJour)
        .sort((a, b) => a.timestamp - b.timestamp)
      const etat = etatSalarie(pts)
      // Cherche le dernier pointage de type 'arrivée' du jour.
      const derniereArrivee = [...pts].reverse().find((p) => p.type === 'arrivee')
      const epi = derniereArrivee?.epi || null
      const estPresent = etat === 'present' || etat === 'en_pause'
      const conforme = epi && epi.gilet && epi.bottes && epi.casque
      return { salarie: s, site: sites.find((x) => x.id === s.siteId), etat, epi, estPresent, conforme }
    })
  }, [salaries, sites, pointages, cleJour])

  const nbPresents   = statutsEPI.filter((x) => x.estPresent).length
  const nbConformes  = statutsEPI.filter((x) => x.conforme).length
  const nbAlerte     = statutsEPI.filter((x) => x.estPresent && !x.conforme).length

  // Formulaire signalement.
  const [sigForm, setSigForm] = useState({
    salarieId: salaries.find((s) => s.actif)?.id || '',
    equipements: [],
    details: '',
  })

  const EQUIPEMENTS_EPI = [
    { id: 'gilet', label: 'Gilet', icone: '🦺' },
    { id: 'bottes', label: 'Bottes', icone: '🥾' },
    { id: 'casque', label: 'Casque', icone: '⛑️' },
  ]

  function toggleEquipement(id) {
    setSigForm((prev) => ({
      ...prev,
      equipements: prev.equipements.includes(id)
        ? prev.equipements.filter((e) => e !== id)
        : [...prev.equipements, id],
    }))
  }

  function soumettreSignalement(e) {
    e.preventDefault()
    if (!sigForm.equipements.length) return
    signalerRenouvellementEPI(sigForm.salarieId, sigForm.equipements, sigForm.details)
    setSigForm({ salarieId: salaries.find((s) => s.actif)?.id || '', equipements: [], details: '' })
  }

  const nomSalarie = (id) => {
    const s = salaries.find((x) => x.id === id)
    return s ? `${s.prenom} ${s.nom}` : id
  }
  const nomSite = (id) => sites.find((x) => x.id === id)?.nom || ''

  const signalementsTries = [...signalements].sort((a, b) => b.timestamp - a.timestamp)

  function badgeEPI(statut) {
    if (!statut.epi) return <span className="epi-badge inconnu">—</span>
    return (
      <span style={{ display: 'inline-flex', gap: 4 }}>
        {EQUIPEMENTS_EPI.map((eq) => (
          <span
            key={eq.id}
            title={eq.label}
            style={{ fontSize: 18, opacity: statut.epi[eq.id] ? 1 : 0.25 }}
          >
            {eq.icone}
          </span>
        ))}
      </span>
    )
  }

  return (
    <div className="grille" style={{ gap: 18 }}>
      <h2 style={{ margin: 0 }}>Conformité EPI — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>

      {/* KPIs */}
      <div className="grille k3">
        <div className="kpi"><div className="v vert">{nbPresents}</div><div className="l">Présents sur site</div></div>
        <div className="kpi"><div className="v vert">{nbConformes}</div><div className="l">EPI conformes</div></div>
        <div className="kpi"><div className="v" style={{ color: nbAlerte > 0 ? 'var(--rouge)' : 'var(--texte-doux)' }}>{nbAlerte}</div><div className="l">Alertes non-conformité</div></div>
      </div>

      {/* Tableau de conformité */}
      <div className="carte">
        <h2>Statut EPI par salarié</h2>
        <table>
          <thead>
            <tr>
              <th>Salarié</th>
              <th>Site</th>
              <th>État</th>
              <th>EPI validés à l'arrivée</th>
              <th>Conformité</th>
            </tr>
          </thead>
          <tbody>
            {statutsEPI.map(({ salarie, site, etat, epi, estPresent, conforme }) => (
              <tr key={salarie.id}>
                <td><strong>{salarie.avatar} {salarie.prenom} {salarie.nom}</strong></td>
                <td>{site?.nom || '—'}</td>
                <td>
                  <span className={`etat ${etat}`}>
                    <span className={`pastille ${etat}`} />
                    {etiquetteEtat(etat)}
                  </span>
                </td>
                <td>{badgeEPI({ epi })}</td>
                <td>
                  {!estPresent
                    ? <span className="epi-badge inconnu">Absent</span>
                    : conforme
                      ? <span className="epi-badge conforme">✅ Conforme</span>
                      : <span className="epi-badge non-conforme">⚠️ Non conforme</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Signalement de renouvellement */}
      <div className="grille grille-form-sym" style={{ alignItems: 'start' }}>
        <div className="carte">
          <h2>Signaler un renouvellement EPI</h2>
          <form onSubmit={soumettreSignalement}>
            <div className="champ">
              <label>Salarié concerné</label>
              <select value={sigForm.salarieId} onChange={(e) => setSigForm({ ...sigForm, salarieId: e.target.value })}>
                {salaries.filter((s) => s.actif).map((s) => (
                  <option key={s.id} value={s.id}>{s.prenom} {s.nom}</option>
                ))}
              </select>
            </div>
            <div className="champ">
              <label>Équipement(s) à renouveler</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                {EQUIPEMENTS_EPI.map((eq) => (
                  <button
                    key={eq.id}
                    type="button"
                    className={`epi-toggle ${sigForm.equipements.includes(eq.id) ? 'actif' : ''}`}
                    onClick={() => toggleEquipement(eq.id)}
                  >
                    {eq.icone} {eq.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="champ">
              <label>Détails (facultatif)</label>
              <input
                placeholder="Ex : casque fissuré, gilet déchiré…"
                value={sigForm.details}
                onChange={(e) => setSigForm({ ...sigForm, details: e.target.value })}
              />
            </div>
            <button
              type="submit"
              className="btn"
              disabled={!sigForm.equipements.length}
            >
              Enregistrer le signalement
            </button>
          </form>
        </div>

        <div className="carte">
          <h2>Signalements en cours ({signalementsTries.filter((s) => !s.traite).length})</h2>
          {signalementsTries.length === 0 && (
            <p className="muet">Aucun signalement enregistré.</p>
          )}
          {signalementsTries.map((sig) => (
            <div key={sig.id} className={`signalement-item ${sig.traite ? 'traite' : ''}`}>
              <div className="signalement-header">
                <strong>{nomSalarie(sig.salarieId)}</strong>
                <span className="muet" style={{ fontSize: 12 }}>
                  {new Date(sig.timestamp).toLocaleDateString('fr-FR')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, margin: '6px 0', flexWrap: 'wrap' }}>
                {sig.equipements.map((eq) => {
                  const item = EQUIPEMENTS_EPI.find((e) => e.id === eq)
                  return item ? (
                    <span key={eq} className="epi-badge non-conforme">{item.icone} {item.label}</span>
                  ) : null
                })}
              </div>
              {sig.details && <p className="muet" style={{ fontSize: 13, margin: '4px 0' }}>{sig.details}</p>}
              {!sig.traite && (
                <button
                  className="btn gris mini"
                  style={{ marginTop: 6 }}
                  onClick={() => marquerSignalementTraite(sig.id)}
                >
                  ✓ Marquer comme traité
                </button>
              )}
              {sig.traite && <span style={{ fontSize: 12, color: 'var(--vert)', fontWeight: 700 }}>✅ Traité</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// =============================================================
//  RÉCAPITULATIFS & EXPORT CSV
// =============================================================
function Recapitulatifs({ app }) {
  const { salaries, sites, pointages } = app
  const [decalage, setDecalage] = useState(0)
  const dateRef = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + decalage * 7)
    return d
  }, [decalage])

  const jours = joursDeLaSemaine(dateRef)
  const nomSite = (id) => sites.find((x) => x.id === id)?.nom || ''

  function exporter() {
    const csv = exporterCSVSemaine(pointages, salaries, sites, dateRef)
    telechargerCSV(csv, `AlchiPass_heures_${jours[0]}_au_${jours[6]}.csv`)
  }

  return (
    <div className="grille" style={{ gap: 18 }}>
      <div className="flex between wrap">
        <h2 style={{ margin: 0 }}>Récapitulatif hebdomadaire</h2>
        <div className="flex wrap recap-nav">
          <button className="btn gris mini" onClick={() => setDecalage((d) => d - 1)}>← Semaine préc.</button>
          <span className="muet">{nomJourCourt(jours[0])} → {nomJourCourt(jours[6])}</span>
          <button className="btn gris mini" onClick={() => setDecalage((d) => d + 1)} disabled={decalage >= 0}>Suiv. →</button>
          <button className="btn bleu" onClick={exporter}>⬇️ Export CSV (paie)</button>
        </div>
      </div>

      <div className="carte" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Salarié</th>
              <th>Site</th>
              {jours.map((c) => <th key={c}>{nomJourCourt(c)}</th>)}
              <th>Total</th>
              <th>Contrat</th>
            </tr>
          </thead>
          <tbody>
            {salaries.filter((s) => s.actif).map((s) => {
              const { totalMinutes, detailJours } = totalSemaine(pointages, s.id, dateRef)
              const ecart = totalMinutes / 60 - s.heuresHebdo
              return (
                <tr key={s.id}>
                  <td><strong>{s.prenom} {s.nom}</strong></td>
                  <td>{nomSite(s.siteId)}</td>
                  {jours.map((c) => {
                    const min = detailJours[c]?.minutesTravaillees || 0
                    return <td key={c}>{min ? formatDuree(min) : <span className="muet">—</span>}</td>
                  })}
                  <td><strong>{formatDuree(totalMinutes)}</strong></td>
                  <td style={{ color: Math.abs(ecart) > 1 ? 'var(--orange)' : 'var(--texte-doux)' }}>
                    {s.heuresHebdo}h {ecart >= 0 ? '+' : ''}{ecart.toFixed(1)}h
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muet" style={{ fontSize: 13 }}>
        Le temps travaillé est calculé automatiquement : (départ − arrivée) − pauses. L'export CSV s'ouvre directement dans Excel.
      </p>
    </div>
  )
}

// =============================================================
//  GESTION DES SALARIÉS
// =============================================================
function GestionSalaries({ app }) {
  const { salaries, sites, ajouterSalarie, modifierSalarie, basculerActifSalarie, ajouterSite } = app
  const FORM_VIDE = { prenom: '', nom: '', role: 'OPERATEUR', siteId: sites[0]?.id || '', pin: '1234', heuresHebdo: 35, avatar: '🧑' }
  const [form, setForm] = useState(FORM_VIDE)
  const [edition, setEdition] = useState(null)
  const [nouveauSite, setNouveauSite] = useState('')

  const nomSite = (id) => sites.find((x) => x.id === id)?.nom || ''

  function soumettre(e) {
    e.preventDefault()
    if (!form.prenom || !form.nom) return
    if (edition) {
      modifierSalarie(edition, { ...form, heuresHebdo: Number(form.heuresHebdo) })
      setEdition(null)
    } else {
      ajouterSalarie({ ...form, heuresHebdo: Number(form.heuresHebdo) })
    }
    setForm({ ...FORM_VIDE, siteId: sites[0]?.id || '' })
  }

  function editer(s) {
    setEdition(s.id)
    setForm({ prenom: s.prenom, nom: s.nom, role: s.role || 'OPERATEUR', siteId: s.siteId, pin: s.pin, heuresHebdo: s.heuresHebdo, avatar: s.avatar || '🧑' })
  }

  return (
    <div className="grille grille-form" style={{ alignItems: 'start' }}>
      <div className="carte">
        <h2>{edition ? 'Modifier un salarié' : 'Ajouter un salarié'}</h2>
        <form onSubmit={soumettre}>
          <div className="grille k2">
            <div className="champ"><label>Prénom</label><input value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} /></div>
            <div className="champ"><label>Nom</label><input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></div>
          </div>
          <div className="grille k2">
            <div className="champ"><label>Site d'affectation</label>
              <select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            </div>
            <div className="champ"><label>Rôle</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="OPERATEUR">🏭 Opérateur</option>
                <option value="COLLECTEUR">🚛 Collecteur</option>
              </select>
            </div>
          </div>
          <div className="grille k3">
            <div className="champ"><label>Code PIN</label><input maxLength={4} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} /></div>
            <div className="champ"><label>Heures / sem.</label><input type="number" value={form.heuresHebdo} onChange={(e) => setForm({ ...form, heuresHebdo: e.target.value })} /></div>
            <div className="champ"><label>Avatar</label><input value={form.avatar} onChange={(e) => setForm({ ...form, avatar: e.target.value })} /></div>
          </div>
          <button className="btn" type="submit">{edition ? 'Enregistrer' : 'Ajouter'}</button>
          {edition && (
            <button className="btn gris mini" type="button" style={{ marginLeft: 8 }}
              onClick={() => { setEdition(null); setForm({ prenom: '', nom: '', siteId: sites[0]?.id || '', pin: '1234', heuresHebdo: 35, avatar: '🧑' }) }}>
              Annuler
            </button>
          )}
        </form>

        <h3 style={{ marginTop: 22 }}>Sites</h3>
        <div className="flex wrap">
          {sites.map((s) => <span key={s.id} className="etat parti">{s.nom}</span>)}
        </div>
        <div className="flex mt">
          <input placeholder="Nouveau site" value={nouveauSite} onChange={(e) => setNouveauSite(e.target.value)} />
          <button className="btn secondaire mini" onClick={() => { if (nouveauSite.trim()) { ajouterSite(nouveauSite.trim()); setNouveauSite('') } }}>+ Ajouter</button>
        </div>
      </div>

      <div className="carte">
        <h2>Salariés ({salaries.filter((s) => s.actif).length} actifs)</h2>
        <table>
          <thead><tr><th>Salarié</th><th>Site</th><th>Rôle</th><th>Contrat</th><th>PIN</th><th>État</th><th></th></tr></thead>
          <tbody>
            {salaries.map((s) => (
              <tr key={s.id} style={{ opacity: s.actif ? 1 : 0.45 }}>
                <td><strong>{s.avatar} {s.prenom} {s.nom}</strong></td>
                <td>{nomSite(s.siteId)}</td>
                <td>
                  {s.role === 'COLLECTEUR'
                    ? <span className="etat present" style={{ fontSize: 12 }}>🚛 Collecteur</span>
                    : <span className="etat" style={{ fontSize: 12, background: 'var(--bleu)', color: '#fff' }}>🏭 Opérateur</span>}
                </td>
                <td>{s.heuresHebdo}h</td>
                <td><code>{s.pin}</code></td>
                <td>{s.actif ? <span className="etat present">Actif</span> : <span className="etat absent">Désactivé</span>}</td>
                <td>
                  <div className="row-actions">
                    <button className="btn gris mini" onClick={() => editer(s)}>Modifier</button>
                    <button className="btn mini" style={{ background: s.actif ? 'var(--rouge)' : 'var(--vert)' }} onClick={() => basculerActifSalarie(s.id)}>
                      {s.actif ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// =============================================================
//  POINTAGES & CORRECTIONS
// =============================================================
function GestionPointages({ app }) {
  const { salaries, pointages, corrigerPointage, ajouterPointageManuel, supprimerPointage } = app
  const [salarieId, setSalarieId] = useState(salaries[0]?.id || '')
  const [jour, setJour] = useState(dateKey(new Date()))
  const [ajout, setAjout] = useState({ type: 'arrivee', heure: '08:00' })
  // Modal de correction : null = fermée, sinon { pointageId, heureActuelle, typeLabel }
  const [modal, setModal] = useState(null)

  const liste = pointages
    .filter((p) => p.salarieId === salarieId && p.cle === jour)
    .sort((a, b) => a.timestamp - b.timestamp)

  function tsDepuisHeure(heure) {
    const [y, m, j] = jour.split('-').map(Number)
    const [h, min] = heure.split(':').map(Number)
    return new Date(y, m - 1, j, h, min).getTime()
  }

  function corriger(p) {
    setModal({
      pointageId:   p.id,
      heureActuelle: formatHeure(p.timestamp),
      typeLabel:    LIBELLE_ACTION[p.type],
    })
  }

  function confirmerCorrection(nouvelleHeure) {
    if (!nouvelleHeure) return
    corrigerPointage(modal.pointageId, tsDepuisHeure(nouvelleHeure), 'admin')
    setModal(null)
  }

  return (
    <>
    {modal && (
      <ModalCorrection
        typeLabel={modal.typeLabel}
        heureActuelle={modal.heureActuelle}
        onConfirmer={confirmerCorrection}
        onAnnuler={() => setModal(null)}
      />
    )}
    <div className="grille" style={{ gap: 18 }}>
      <div className="carte">
        <h2>Corriger / ajouter un pointage</h2>
        <div className="grille k3">
          <div className="champ"><label>Salarié</label>
            <select value={salarieId} onChange={(e) => setSalarieId(e.target.value)}>
              {salaries.map((s) => <option key={s.id} value={s.id}>{s.prenom} {s.nom}</option>)}
            </select>
          </div>
          <div className="champ"><label>Jour</label>
            <input type="date" value={jour} onChange={(e) => setJour(e.target.value)} />
          </div>
        </div>

        <table>
          <thead><tr><th>Type</th><th>Heure</th><th>Origine</th><th>Traçabilité</th><th></th></tr></thead>
          <tbody>
            {liste.length === 0 && <tr><td colSpan={5} className="muet">Aucun pointage ce jour-là.</td></tr>}
            {liste.map((p) => (
              <tr key={p.id}>
                <td><strong>{LIBELLE_ACTION[p.type]}</strong></td>
                <td>{formatHeure(p.timestamp)}</td>
                <td>{p.origine === 'correction' ? <span className="tag-origine">Corrigé</span> : 'Borne'}</td>
                <td className="muet" style={{ fontSize: 12 }}>
                  {p.modifications?.length
                    ? p.modifications.map((m, i) => (
                        <div key={i}>
                          {m.ajoutManuel
                            ? `Ajout manuel par ${m.auteur}`
                            : `${formatHeure(m.ancienTimestamp)} → ${formatHeure(m.nouveauTimestamp)} (${m.auteur})`}
                        </div>
                      ))
                    : '—'}
                </td>
                <td>
                  <div className="row-actions">
                    <button className="btn gris mini" onClick={() => corriger(p)}>Corriger</button>
                    <button className="btn danger mini" onClick={() => { if (confirm('Supprimer ce pointage ?')) supprimerPointage(p.id) }}>Suppr.</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ marginTop: 22 }}>Ajouter un pointage oublié</h3>
        <div className="flex wrap">
          <select style={{ width: 200 }} value={ajout.type} onChange={(e) => setAjout({ ...ajout, type: e.target.value })}>
            {Object.entries(LIBELLE_ACTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input style={{ width: 130 }} type="time" value={ajout.heure} onChange={(e) => setAjout({ ...ajout, heure: e.target.value })} />
          <button className="btn" onClick={() => ajouterPointageManuel(salarieId, ajout.type, tsDepuisHeure(ajout.heure), 'admin')}>+ Ajouter</button>
        </div>
        <p className="muet" style={{ fontSize: 12, marginTop: 10 }}>
          Toute correction conserve l'ancienne valeur et l'auteur de la modification (traçabilité).
        </p>
      </div>
    </div>
    </>
  )
}

// =============================================================
//  PLANNING HEBDOMADAIRE + PAUSES PAR DÉFAUT
// =============================================================
function GestionPlanning({ app }) {
  const { salaries, planning, definirCreneau, pausesDefaut = [], modifierPauseDefaut } = app
  const joursNoms = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']

  return (
    <div className="grille" style={{ gap: 18 }}>
      {/* Créneaux de pauses collectives */}
      <div className="carte">
        <h2>Créneaux de pauses collectives</h2>
        <p className="muet" style={{ marginTop: -6 }}>
          Horaires des pauses communes à tous les salariés. Modifie les heures selon les besoins.
        </p>
        <table>
          <thead>
            <tr><th>Pause</th><th>Début</th><th>Fin</th><th>Durée</th></tr>
          </thead>
          <tbody>
            {pausesDefaut.map((pause) => {
              const [hD, mD] = pause.debut.split(':').map(Number)
              const [hF, mF] = pause.fin.split(':').map(Number)
              const duree = (hF * 60 + mF) - (hD * 60 + mD)
              return (
                <tr key={pause.id}>
                  <td><strong>{pause.label}</strong></td>
                  <td>
                    <input
                      type="time"
                      style={{ width: 130, padding: '8px 10px' }}
                      defaultValue={pause.debut}
                      onBlur={(e) => {
                        if (e.target.value) modifierPauseDefaut(pause.id, { debut: e.target.value })
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      style={{ width: 130, padding: '8px 10px' }}
                      defaultValue={pause.fin}
                      onBlur={(e) => {
                        if (e.target.value) modifierPauseDefaut(pause.id, { fin: e.target.value })
                      }}
                    />
                  </td>
                  <td className="muet">{duree > 0 ? `${duree} min` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Planning hebdomadaire */}
      <div className="carte" style={{ overflowX: 'auto' }}>
        <h2>Planning hebdomadaire prévisionnel</h2>
        <p className="muet" style={{ marginTop: -6 }}>Saisis les créneaux prévus (format 06:00-14:30). Laisse vide pour un jour non travaillé.</p>
        <table>
          <thead>
            <tr><th>Salarié</th>{joursNoms.map((j) => <th key={j}>{j}</th>)}</tr>
          </thead>
          <tbody>
            {salaries.filter((s) => s.actif).map((s) => (
              <tr key={s.id}>
                <td><strong>{s.prenom} {s.nom}</strong></td>
                {[0, 1, 2, 3, 4].map((j) => (
                  <td key={j}>
                    <input
                      style={{ width: 120, padding: '6px 8px' }}
                      placeholder="—"
                      defaultValue={planning?.[s.id]?.[j] || ''}
                      onBlur={(e) => definirCreneau(s.id, j, e.target.value.trim())}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// =============================================================
//  ANOMALIES
// =============================================================
function Anomalies({ app }) {
  const { salaries, planning, pointages } = app
  const liste = useMemo(
    () => detecterAnomalies(pointages, salaries, planning),
    [pointages, salaries, planning]
  )

  return (
    <div className="carte">
      <h2>Anomalies détectées (semaine en cours)</h2>
      {liste.length === 0 && <p className="muet">✅ Aucune anomalie. Tous les pointages sont cohérents.</p>}
      {liste.map((a, i) => (
        <div key={i} className={`alerte ${a.gravite}`}>
          {a.gravite === 'err' ? '⛔' : '⚠️'}
          <strong>{a.salarie}</strong> — {a.message}
        </div>
      ))}
    </div>
  )
}

// =============================================================
//  MODAL — CORRECTION D'HORAIRE
// =============================================================
function ModalCorrection({ typeLabel, heureActuelle, onConfirmer, onAnnuler }) {
  const [heure, setHeure] = useState(heureActuelle)
  const inputRef = useRef(null)

  // Focus automatique sur le champ à l'ouverture.
  useEffect(() => { inputRef.current?.focus() }, [])

  // Accessibilité clavier : Échap = annuler, Entrée = valider.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onAnnuler()
      if (e.key === 'Enter')  onConfirmer(heure)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [heure, onConfirmer, onAnnuler])

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-titre" onClick={onAnnuler}>
      <div className="modal-conteneur" onClick={(e) => e.stopPropagation()}>
        <div className="modal-entete">
          <h3 id="modal-titre">Modifier l'horaire</h3>
          <p className="muet" style={{ margin: '4px 0 0', fontSize: 13 }}>
            Pointage : <strong>{typeLabel}</strong>
          </p>
        </div>

        <div className="modal-corps">
          <label htmlFor="modal-input-heure">Nouvelle heure (HH:MM)</label>
          <input
            id="modal-input-heure"
            ref={inputRef}
            type="time"
            value={heure}
            onChange={(e) => setHeure(e.target.value)}
          />
        </div>

        <div className="modal-pied">
          <button className="modal-annuler" onClick={onAnnuler}>Annuler</button>
          <button className="modal-valider" onClick={() => onConfirmer(heure)} disabled={!heure}>
            Valider
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================
//  CASQUES & ASSOCIATIONS RFID
// =============================================================
function GestionCasques({ app }) {
  const {
    casques = [], associations = [], badgesManagers = [],
    salaries,
    ajouterCasque, modifierCasque, supprimerCasque, associerCasque,
    ajouterBadgeManager, supprimerBadgeManager,
  } = app
  const cleJour = dateKey(new Date())

  // ── États formulaire ajout casque ────────────────────────────
  const [formCasque, setFormCasque] = useState({ uid_rfid: '', num_interne_casque: '', etat: 'actif' })

  // ── États édition inline casque ───────────────────────────────
  const [enEditionCasque, setEnEditionCasque] = useState(null)  // id du casque en cours d'édition
  const [valsCasque, setValsCasque] = useState({})

  // ── États formulaire ajout badge manager ──────────────────────
  const FORM_BADGE_VIDE = { uid_rfid: '', role: 'rh', label: '' }
  const [formBadge, setFormBadge] = useState(FORM_BADGE_VIDE)
  const [ajoutBadgeOuvert, setAjoutBadgeOuvert] = useState(false)

  // ── États édition inline badge manager ────────────────────────
  const [enEditionBadge, setEnEditionBadge] = useState(null)  // uid_rfid original du badge édité
  const [valsBadge, setValsBadge] = useState({})

  // ── Modal de confirmation ────────────────────────────────────
  // Le state stocke l'intention (quoi supprimer), pas une fonction.
  // { type: 'casque'|'badge', id?, uid?, titre, message }
  const [confirm, setConfirm] = useState(null)

  async function executerSuppression() {
    if (!confirm) return
    if (confirm.type === 'casque') await supprimerCasque(confirm.id)
    else if (confirm.type === 'badge') await supprimerBadgeManager(confirm.uid)
    setConfirm(null)
  }

  const nomSalarie = (id) => {
    const s = salaries.find((x) => x.id === id)
    return s ? `${s.avatar || ''} ${s.prenom} ${s.nom}` : '—'
  }

  const assocDuJour = (casqueId) =>
    associations.find((a) => a.id_rfid_sticker === casqueId && a.date_association === cleJour)

  const ETATS_CASQUE = {
    actif:       { label: 'Actif',       couleur: 'var(--vert)' },
    defectueux:  { label: 'Défectueux',  couleur: 'var(--orange)' },
    inactif:     { label: 'Inactif',     couleur: 'var(--texte-doux)' },
  }

  // ── Handlers casques ─────────────────────────────────────────
  function soumettreNouveauCasque(e) {
    e.preventDefault()
    if (!formCasque.uid_rfid || !formCasque.num_interne_casque) return
    ajouterCasque(formCasque)
    setFormCasque({ uid_rfid: '', num_interne_casque: '', etat: 'actif' })
  }

  function ouvrirEditionCasque(c) {
    setEnEditionCasque(c.id)
    setValsCasque({ uid_rfid: c.uid_rfid, num_interne_casque: c.num_interne_casque, etat: c.etat })
  }

  function sauvegarderCasque(id) {
    if (!valsCasque.uid_rfid || !valsCasque.num_interne_casque) return
    modifierCasque(id, valsCasque)
    setEnEditionCasque(null)
  }

  function confirmerSuppressionCasque(c) {
    const assoc = assocDuJour(c.id)
    const message = assoc
      ? `Le casque ${c.num_interne_casque} est actuellement assigné à ${nomSalarie(assoc.id_salarie)}. L'association du jour sera également supprimée.`
      : `Le casque ${c.num_interne_casque} (${c.uid_rfid}) sera définitivement supprimé.`
    setConfirm({ type: 'casque', id: c.id, titre: `Supprimer le casque ${c.num_interne_casque} ?`, message })
  }

  // ── Handlers badges managers ─────────────────────────────────
  function soumettreNouveauBadge(e) {
    e.preventDefault()
    if (!formBadge.uid_rfid || !formBadge.label) return
    ajouterBadgeManager(formBadge.uid_rfid.toUpperCase(), formBadge.role, formBadge.label)
    setFormBadge(FORM_BADGE_VIDE)
    setAjoutBadgeOuvert(false)
  }

  function ouvrirEditionBadge(b) {
    setEnEditionBadge(b.uid_rfid)
    setValsBadge({ uid_rfid: b.uid_rfid, role: b.role, label: b.label })
    setAjoutBadgeOuvert(false)
  }

  async function sauvegarderBadge() {
    if (!valsBadge.uid_rfid || !valsBadge.label) return
    const nouvelUid = valsBadge.uid_rfid.toUpperCase()
    // Si l'UID a changé, supprimer l'ancien avant d'insérer le nouveau
    if (nouvelUid !== enEditionBadge) {
      await supprimerBadgeManager(enEditionBadge)
    }
    await ajouterBadgeManager(nouvelUid, valsBadge.role, valsBadge.label)
    setEnEditionBadge(null)
  }

  // ── Style partagé pour les lignes en édition ─────────────────
  const styleEdition = { background: 'var(--vert-clair)', outline: '2px solid var(--vert)' }
  const styleInputEdition = { padding: '5px 8px', borderRadius: 10, fontSize: 13,
                               border: '1.5px solid var(--bordure)', width: '100%' }

  return (
    <div className="grille" style={{ gap: 18 }}>
      {confirm && (
        <ModalConfirmation
          titre={confirm.titre}
          message={confirm.message}
          onConfirm={executerSuppression}
          onAnnuler={() => setConfirm(null)}
        />
      )}

      <h2 style={{ margin: 0 }}>Casques & Badgeuse RFID</h2>

      {/* ── Badges managers ── */}
      <div className="carte">
        <div className="flex between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Badges managers (cartes d'accès)</h2>
          <button className="btn mini" onClick={() => { setAjoutBadgeOuvert(v => !v); setEnEditionBadge(null) }}>
            {ajoutBadgeOuvert ? '✕ Annuler' : '+ Ajouter'}
          </button>
        </div>

        {/* Formulaire ajout badge */}
        {ajoutBadgeOuvert && (
          <form onSubmit={soumettreNouveauBadge}
            style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16,
                     padding: '14px 16px', background: 'var(--fond)', borderRadius: 14,
                     border: '1.5px solid var(--bordure)' }}>
            <div className="champ" style={{ margin: 0, flex: '1 1 160px' }}>
              <label>UID RFID</label>
              <input
                placeholder="ex : 04ABCDEF1234"
                value={formBadge.uid_rfid}
                onChange={e => setFormBadge({ ...formBadge, uid_rfid: e.target.value.toUpperCase() })}
                required
              />
            </div>
            <div className="champ" style={{ margin: 0, flex: '0 0 110px' }}>
              <label>Rôle</label>
              <select value={formBadge.role} onChange={e => setFormBadge({ ...formBadge, role: e.target.value })}>
                <option value="rh">RH</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="champ" style={{ margin: 0, flex: '1 1 160px' }}>
              <label>Label (nom de la carte)</label>
              <input
                placeholder="ex : Carte RH Marie"
                value={formBadge.label}
                onChange={e => setFormBadge({ ...formBadge, label: e.target.value })}
                required
              />
            </div>
            <button className="btn" type="submit" style={{ marginBottom: 2 }}>Enregistrer</button>
          </form>
        )}

        <table>
          <thead>
            <tr><th>Rôle</th><th>Label</th><th>UID RFID</th><th></th></tr>
          </thead>
          <tbody>
            {badgesManagers.length === 0 && (
              <tr><td colSpan={4} className="muet" style={{ textAlign: 'center', padding: 16 }}>Aucun badge manager enregistré</td></tr>
            )}
            {badgesManagers.map((b) => {
              const enEdition = enEditionBadge === b.uid_rfid
              return (
                <tr key={b.uid_rfid} style={enEdition ? styleEdition : {}}>
                  {enEdition ? (
                    <>
                      <td>
                        <select
                          style={{ ...styleInputEdition, width: 90 }}
                          value={valsBadge.role}
                          onChange={e => setValsBadge({ ...valsBadge, role: e.target.value })}
                        >
                          <option value="rh">👤 RH</option>
                          <option value="admin">🔐 Admin</option>
                        </select>
                      </td>
                      <td>
                        <input
                          style={styleInputEdition}
                          value={valsBadge.label}
                          onChange={e => setValsBadge({ ...valsBadge, label: e.target.value })}
                          placeholder="Label"
                        />
                      </td>
                      <td>
                        <input
                          style={styleInputEdition}
                          value={valsBadge.uid_rfid}
                          onChange={e => setValsBadge({ ...valsBadge, uid_rfid: e.target.value.toUpperCase() })}
                          placeholder="UID RFID"
                        />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn mini" style={{ marginRight: 6 }} onClick={sauvegarderBadge}>✓ Sauvegarder</button>
                        <button className="btn gris mini" onClick={() => setEnEditionBadge(null)}>Annuler</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><span className={`role-badge-mini ${b.role}`}>{b.role === 'rh' ? '👤 RH' : '🔐 Admin'}</span></td>
                      <td>{b.label}</td>
                      <td><code style={{ fontSize: 11 }}>{b.uid_rfid}</code></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn gris mini" style={{ marginRight: 6 }} onClick={() => ouvrirEditionBadge(b)}>Modifier</button>
                        <button
                          className="btn rouge mini"
                          onClick={() => setConfirm({
                            type: 'badge', uid: b.uid_rfid,
                            titre: `Supprimer le badge "${b.label}" ?`,
                            message: `La carte ${b.role.toUpperCase()} (UID : ${b.uid_rfid}) sera définitivement retirée. Elle ne permettra plus d'accéder à l'espace manager.`,
                          })}
                        >
                          Supprimer
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="muet" style={{ fontSize: 12, marginTop: 10 }}>
          Ces cartes redirigent vers la connexion manager lorsqu'elles sont détectées par la badgeuse.
        </p>
      </div>

      {/* ── Associations du jour ── */}
      <div className="carte">
        <h2>Associations du jour — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        <p className="muet" style={{ marginTop: -6 }}>Assigne un casque à chaque salarié présent aujourd'hui.</p>
        <table>
          <thead>
            <tr><th>Salarié</th><th>Casque assigné aujourd'hui</th></tr>
          </thead>
          <tbody>
            {salaries.filter((s) => s.actif).map((s) => {
              const assoc = associations.find(
                (a) => a.id_salarie === s.id && a.date_association === cleJour
              )
              return (
                <tr key={s.id}>
                  <td><strong>{s.avatar} {s.prenom} {s.nom}</strong></td>
                  <td>
                    <select
                      style={{ width: 220 }}
                      value={assoc?.id_rfid_sticker || ''}
                      onChange={(e) => associerCasque(s.id, e.target.value || null)}
                    >
                      <option value="">— Non assigné —</option>
                      {casques.filter((c) => c.etat === 'actif').map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.num_interne_casque} · {c.uid_rfid}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Inventaire des casques ── */}
      <div className="grille grille-form" style={{ alignItems: 'start' }}>
        <div className="carte">
          <h2>Ajouter un casque</h2>
          <form onSubmit={soumettreNouveauCasque}>
            <div className="champ">
              <label>UID RFID (lu par le RC522)</label>
              <input
                placeholder="ex : 0401ABCDEF"
                value={formCasque.uid_rfid}
                onChange={(e) => setFormCasque({ ...formCasque, uid_rfid: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="champ">
              <label>N° interne casque</label>
              <input
                placeholder="ex : C-009"
                value={formCasque.num_interne_casque}
                onChange={(e) => setFormCasque({ ...formCasque, num_interne_casque: e.target.value })}
              />
            </div>
            <button className="btn" type="submit">+ Ajouter</button>
          </form>
        </div>

        <div className="carte">
          <h2>Inventaire ({casques.length} casques)</h2>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>N° interne</th><th>UID RFID</th><th>État</th><th>Assigné à</th><th></th></tr>
              </thead>
              <tbody>
                {casques.map((c) => {
                  const assoc = assocDuJour(c.id)
                  const etatInfo = ETATS_CASQUE[c.etat] || ETATS_CASQUE.inactif
                  const enEdition = enEditionCasque === c.id
                  return (
                    <tr key={c.id} style={enEdition ? styleEdition : {}}>
                      {enEdition ? (
                        <>
                          <td>
                            <input
                              style={styleInputEdition}
                              value={valsCasque.num_interne_casque}
                              onChange={e => setValsCasque({ ...valsCasque, num_interne_casque: e.target.value })}
                              placeholder="N° interne"
                            />
                          </td>
                          <td>
                            <input
                              style={styleInputEdition}
                              value={valsCasque.uid_rfid}
                              onChange={e => setValsCasque({ ...valsCasque, uid_rfid: e.target.value.toUpperCase() })}
                              placeholder="UID RFID"
                            />
                          </td>
                          <td>
                            <select
                              style={{ ...styleInputEdition, color: ETATS_CASQUE[valsCasque.etat]?.couleur }}
                              value={valsCasque.etat}
                              onChange={e => setValsCasque({ ...valsCasque, etat: e.target.value })}
                            >
                              {Object.entries(ETATS_CASQUE).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="muet" style={{ fontSize: 12 }}>
                            {assoc ? nomSalarie(assoc.id_salarie) : '—'}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button className="btn mini" style={{ marginRight: 6 }} onClick={() => sauvegarderCasque(c.id)}>✓ Sauvegarder</button>
                            <button className="btn gris mini" onClick={() => setEnEditionCasque(null)}>Annuler</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td><strong>{c.num_interne_casque}</strong></td>
                          <td><code style={{ fontSize: 11 }}>{c.uid_rfid}</code></td>
                          <td>
                            <select
                              style={{ padding: '5px 8px', borderRadius: 10, fontSize: 13,
                                       border: '1.5px solid var(--bordure)', color: etatInfo.couleur }}
                              value={c.etat}
                              onChange={(e) => modifierCasque(c.id, { etat: e.target.value })}
                            >
                              {Object.entries(ETATS_CASQUE).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="muet" style={{ fontSize: 12 }}>
                            {assoc ? nomSalarie(assoc.id_salarie) : '—'}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button className="btn gris mini" style={{ marginRight: 6 }} onClick={() => ouvrirEditionCasque(c)}>Modifier</button>
                            <button className="btn rouge mini" onClick={() => confirmerSuppressionCasque(c)}>Supprimer</button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================
//  MODAL DE CONFIRMATION (remplace window.confirm)
// =============================================================
function ModalConfirmation({ titre, message, labelConfirm = 'Supprimer', onConfirm, onAnnuler }) {
  return createPortal(
    <div className="modal-overlay" onClick={onAnnuler}>
      <div className="modal-conteneur" onClick={e => e.stopPropagation()}>
        <div className="modal-entete">
          <h3>{titre}</h3>
        </div>
        <div className="modal-corps">
          <p style={{ margin: 0, color: 'var(--texte)', lineHeight: 1.6 }}>{message}</p>
        </div>
        <div className="modal-pied">
          <button className="modal-annuler" onClick={onAnnuler}>Annuler</button>
          <button className="modal-valider rouge" onClick={onConfirm}>{labelConfirm}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function etiquetteEtat(etat) {
  return { absent: 'Pas arrivé', present: 'Sur site', en_pause: 'En pause', parti: 'Parti' }[etat] || ''
}

// =============================================================
//  FEEDBACKS SALARIÉS
// =============================================================
function VueFeedbacks({ app }) {
  const { feedbacks = [], salaries } = app
  const [filtreSal, setFiltreSal] = useState('tous')

  const feedbacksFiltres = feedbacks
    .filter(f => filtreSal === 'tous' || f.salarieId === filtreSal)
    .sort((a, b) => b.timestamp - a.timestamp)

  const nomSalarie = (id) => {
    const s = salaries.find(x => x.id === id)
    return s ? `${s.avatar} ${s.prenom} ${s.nom}` : id
  }

  const total = feedbacksFiltres.length
  const moyenne = total > 0
    ? (feedbacksFiltres.reduce((acc, f) => acc + f.note, 0) / total).toFixed(1)
    : '—'
  const nbPositifs = feedbacksFiltres.filter(f => f.note >= 4).length

  const etoiles = (note) => '⭐'.repeat(note) + '☆'.repeat(5 - note)

  return (
    <div className="grille" style={{ gap: 18 }}>
      <div className="flex between wrap">
        <h2 style={{ margin: 0 }}>Feedbacks salariés</h2>
        <select style={{ width: 220 }} value={filtreSal} onChange={e => setFiltreSal(e.target.value)}>
          <option value="tous">Tous les salariés</option>
          {salaries.filter(s => s.actif).map(s => (
            <option key={s.id} value={s.id}>{s.prenom} {s.nom}</option>
          ))}
        </select>
      </div>

      <div className="grille k3">
        <div className="kpi"><div className="v bleu">{total}</div><div className="l">Feedbacks reçus</div></div>
        <div className="kpi"><div className="v orange">{moyenne}<span style={{ fontSize: 18 }}>/5</span></div><div className="l">Note moyenne</div></div>
        <div className="kpi"><div className="v vert">{nbPositifs}</div><div className="l">Journées positives (≥ 4⭐)</div></div>
      </div>

      <div className="carte" style={{ overflowX: 'auto' }}>
        {feedbacksFiltres.length === 0 ? (
          <p className="muet">Aucun feedback enregistré pour ce filtre.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Salarié</th>
                <th>Date</th>
                <th>Note</th>
                <th>Commentaire</th>
              </tr>
            </thead>
            <tbody>
              {feedbacksFiltres.map(f => (
                <tr key={f.id}>
                  <td><strong>{nomSalarie(f.salarieId)}</strong></td>
                  <td>{new Date(f.timestamp).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{etoiles(f.note)}</td>
                  <td>{f.commentaire || <span className="muet">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
