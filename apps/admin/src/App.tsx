import { DEFAULT_LOCALE } from '@wayfarers-rest/shared'

// The admin's shell. Its editors (zones, places, quests, sounds…) are generated from the shared
// content schema later on; see docs/DESIGN.md.
export default function App() {
  return (
    <main>
      <h1>Wayfarer's Rest — Admin</h1>
      <p>À venir : éditeurs du contenu, import des sons, vérification, simulation d'une nuit.</p>
      <p>Langue par défaut du contenu : {DEFAULT_LOCALE}</p>
    </main>
  )
}
