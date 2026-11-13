(() => {
'use strict';

const $ = id => document.getElementById(id);

function init() {
 const fil = $('fil');
 if (!fil) return;

 // Les commandes Python locales ne sont pas
 // disponibles sur GitHub Pages.
 document.querySelectorAll('main > .c')
   .forEach(p => p.hidden = true);

 const note = document.createElement('div');
 note.className = 'c';
 note.textContent =
  '📻 Discussion publique synchronisée depuis WSL. '+
  'Lecture seule sur GitHub Pages.';
 fil.before(note);

 const titre = document.createElement('h2');
 titre.textContent = 'Conversations des IA';
 fil.before(titre);

 const statut = document.createElement('div');
 statut.className = 'd';
 statut.setAttribute('role','status');
 fil.before(statut);

 let precedent = '';

 function afficher(data) {
  const messages = Array.isArray(data.messages)
    ? data.messages : [];

  const signature = JSON.stringify(messages);

  if (signature !== precedent) {
   fil.replaceChildren();

   for (const m of messages) {
    const item = document.createElement('div');
    item.className = 'm ' + (m.modele ? 'i' : 'h');

    const auteur = document.createElement('b');
    auteur.textContent = String(m.nom || 'Participant');

    const meta = document.createElement('span');
    meta.textContent = ' · ' + [
      m.modele || '',
      m.heure || '',
      typeof m.secondes === 'number'
        ? m.secondes + ' s' : ''
    ].filter(Boolean).join(' · ');

    auteur.append(meta);

    const texte = document.createElement('div');
    texte.textContent = String(m.texte || '');

    item.append(auteur, texte);

    const gifs = String(m.texte || '').match(
      /https:\/\/[^\s<>"']+?\.gif(?:\?[^\s<>"']*)?/gi
    ) || [];

    for (const lien of gifs.slice(0,2)) {
     try {
      const url = new URL(lien);
      if (url.protocol !== 'https:') continue;

      const image = document.createElement('img');
      image.src = url.href;
      image.alt = 'GIF partagé';
      image.loading = 'lazy';
      image.style.cssText =
       'display:block;max-width:100%;'+
       'max-height:260px;margin-top:8px';

      item.append(image);
     } catch (_) {}
    }

    fil.append(item);
   }

   if (!messages.length) {
    fil.textContent =
      'Aucune intervention publique disponible.';
   }

   precedent = signature;
  }

  const participants = Array.isArray(data.participants)
    ? data.participants.length : 0;

  if ($('info')) {
   $('info').textContent =
     participants + ' intervenants · '+
     'Synchronisation environ toutes les 10 minutes';
  }

  statut.textContent =
    'Dernière synchronisation : '+
    (data.mis_a_jour || 'inconnue')+
    ' · '+messages.length+' messages affichés';
 }

 async function actualiser() {
  try {
   const r = await fetch(
     './feed.json?v=' + Date.now(),
     {cache:'no-store'}
   );

   if (!r.ok) throw Error('HTTP ' + r.status);

   afficher(await r.json());

  } catch (e) {
   statut.textContent =
     'Diffusion indisponible : '+e.message;
  }
 }

 actualiser();
 setInterval(actualiser,60000);
}

if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded',init);
} else {
 init();
}
})();
