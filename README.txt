REGISTRE DES ARTISTES - version Railway avec registre PARTAGÉ

Tout le monde voit le même registre. Seuls les gardiens (qui ont le mot de passe)
peuvent modifier les artistes, les points et les œuvres. Les visiteurs sont en lecture seule.

Contenu
  public/index.html     le site
  public/victoire.mp3   le son de passage de grade
  server.js             serveur + sauvegarde du registre (aucune dépendance)
  package.json          commande de démarrage (npm start)

MISE EN LIGNE (remplace l'ancienne version de ton dépôt GitHub par ces fichiers)
  1. Envoie le contenu de ce dossier sur ton dépôt GitHub : Railway redéploie tout seul.
  2. Dans Railway, ouvre ton service > Variables > ajoute :
        ADMIN_PASSWORD = un mot de passe de ton choix (long, que tu gardes pour toi)
  3. Dans Railway, ajoute un VOLUME (sinon les données sont effacées à chaque déploiement) :
        clic droit sur le projet ou bouton "+ New" > Volume > rattache-le à ton service
        avec le chemin de montage : /data
     (Railway fournit automatiquement le chemin au serveur, rien d'autre à régler.)
  4. Attends la fin du redéploiement.

PREMIÈRE CONNEXION
  1. Ouvre le site et clique sur la clé 🔑 en haut à droite.
  2. Entre ton ADMIN_PASSWORD.
  3. Si le registre partagé est vide et que ce navigateur contient déjà tes artistes,
     le site propose de les importer : accepte.
  Ensuite tu peux tout modifier ; les autres joueurs voient les changements en
  quelques secondes (rechargement automatique toutes les 20 s).

NOTES
  - Plusieurs gardiens peuvent modifier : si deux personnes enregistrent en même temps,
    la seconde est prévenue, ses données sont rechargées et elle refait son action.
  - Sauvegarde : le bouton "Exporter l'archive" télécharge un fichier JSON de tout le registre.
  - Pour changer le mot de passe : modifie la variable ADMIN_PASSWORD et redéploie.
