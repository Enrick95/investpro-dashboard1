(function(){
  "use strict";

  // Remplacer ces trois destinations avant d'intégrer le formulaire sur le site de l'ami.
  var LEAD_FLOW_CONFIG = {
    telegramUrl: "https://t.me/+mAcBYu895IxiMTdk",
    whatsappNumber: "6285128115218",
    academyUrl: "https://investprotrading.fr/vip",
    brandName: "Enrick 95",
    academyName: "Enrick 95",
    academyLogo: "/business-assets/enrick.jpg",
    telegramSocialProof: "Découvre le canal et rejoins la communauté"
  };

  var questions = [
    {key:"intent",title:"Comment veux-tu avancer ?",hint:"Choisis la voie qui correspond à ce que tu recherches aujourd’hui.",options:[
      {value:"accompagnement",label:"Je veux être accompagné",detail:"Je cherche un cadre et un suivi pour progresser."},
      {value:"formation",label:"Je souhaite me former",detail:"Je veux apprendre et avancer à mon rythme."},
      {value:"telegram",label:"Rejoindre le canal Telegram",detail:LEAD_FLOW_CONFIG.telegramSocialProof,direct:true}
    ]},
    {key:"adult",title:"Es-tu majeur ?",hint:"Cette réponse nous aide à t’orienter vers le bon espace.",options:[
      {value:"yes",label:"Oui, je suis majeur",detail:"Je poursuis le questionnaire."},
      {value:"no",label:"Non, pas encore",detail:"Je peux garder le contact sur Telegram."}
    ]},
    {key:"level",title:"Quel est ton niveau en trading ?",hint:"Il n’y a pas de mauvais point de départ.",options:[
      {value:"debutant",label:"Je débute",detail:"Je découvre encore les bases."},
      {value:"commence",label:"J’ai déjà commencé",detail:"J’ai quelques notions ou premières expériences."},
      {value:"pratique",label:"Je pratique déjà",detail:"Je souhaite continuer à progresser."}
    ]},
    {key:"goal",title:"Qu’est-ce que tu cherches à apprendre ou à améliorer ?",hint:"Choisis ce qui correspond le mieux à ton besoin.",options:[
      {value:"bases",label:"Comprendre les bases",detail:"Poser des repères solides."},
      {value:"methode",label:"Structurer ma méthode",detail:"Mieux organiser mon approche."},
      {value:"robot",label:"Découvrir le robot de trading",detail:"Comprendre l’automatisation et ses risques, sans promesse de revenus."}
    ]},
    {key:"commitment",title:"Es-tu prêt à t’investir sérieusement ?",hint:"L’accompagnement demande de l’implication, du temps et de la constance.",options:[
      {value:"yes",label:"Oui, je suis prêt",detail:"Je suis prêt à avancer avec sérieux et régularité."},
      {value:"no",label:"Pas pour le moment",detail:"Je préfère d’abord découvrir le canal."}
    ]},
    {key:"nextStep",title:"Es-tu prêt à démarrer maintenant ?",hint:"Choisis la suite qui te correspond.",options:[
      {value:"start",label:"Oui, je veux démarrer maintenant",detail:"Voir les accès et choisir une formule."},
      {value:"advisor",label:"Je souhaite parler à un conseiller",detail:"Échanger sur mon profil avant de choisir."}
    ]}
  ];

  var labels={level:{debutant:"Je débute",commence:"J’ai déjà commencé",pratique:"Je pratique déjà"},goal:{bases:"Comprendre les bases",methode:"Structurer ma méthode",robot:"Découvrir le robot de trading"}};
  var answers={};var current=0;var overlay,screen,title,hint,kicker,count,progress,next,back,triggerToRestore;
  var arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7"/></svg>';
  var closeSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  var telegramSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12"/><path d="m19.2 5.1-2.4 13.1c-.18.93-.73 1.16-1.48.72l-4.1-3.02-1.98 1.9c-.22.22-.4.4-.82.4l.3-4.23 7.72-6.98c.34-.3-.07-.47-.53-.17l-9.54 6.01-4.1-1.28c-.9-.28-.92-.9.19-1.31l16.03-6.18c.75-.28 1.4.18 1.15 1.03Z"/></svg>';
  var whatsappSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 11.7a8.1 8.1 0 0 1-11.98 7.1L4 20l1.25-4.2A8.1 8.1 0 1 1 20.4 11.7Z"/><path d="M9.1 8.7c.2-.45.4-.48.67-.48h.43c.14 0 .34.05.44.34l.63 1.52c.08.2.07.37-.07.55l-.47.58c-.15.17-.1.34 0 .5.38.63.93 1.17 1.56 1.55.16.1.33.14.5-.02l.65-.76c.17-.2.36-.22.58-.13l1.42.67c.24.11.36.2.37.36.03.23-.08.91-.58 1.34-.45.39-1.04.54-1.67.37-.62-.17-1.37-.45-2.33-1.22-.76-.61-1.37-1.37-1.75-2.16-.38-.79-.42-1.45-.3-1.92.11-.47.39-.86.52-1.09Z"/></svg>';

  function esc(value){return String(value).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function create(){
    overlay=document.createElement('div');overlay.className='lead-flow-overlay';overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML='<div class="lead-flow-backdrop" data-close></div><section class="lead-flow-dialog" role="dialog" aria-modal="true" aria-labelledby="lead-flow-title" aria-describedby="lead-flow-hint"><button class="lead-flow-close" type="button" data-close aria-label="Fermer">'+closeSvg+'</button><div class="lead-flow-brand"><img class="lead-flow-brand-mark" src="'+esc(LEAD_FLOW_CONFIG.academyLogo)+'" alt=""><span>'+esc(LEAD_FLOW_CONFIG.brandName)+'</span><small>ÉCHANGE PRIVÉ</small></div><div class="lead-flow-meta"><span id="lead-flow-count"></span><span>TON ACCÈS PERSONNALISÉ</span></div><div class="lead-flow-progress"><i id="lead-flow-progress"></i></div><header class="lead-flow-heading"><p class="lead-flow-kicker" id="lead-flow-kicker"></p><h2 id="lead-flow-title"></h2><p class="lead-flow-hint" id="lead-flow-hint"></p></header><div class="lead-flow-screen" id="lead-flow-screen" aria-live="polite"></div><nav class="lead-flow-nav"><button class="lead-flow-back" type="button" id="lead-flow-back">Retour</button><button class="lead-flow-next" type="button" id="lead-flow-next" disabled>Continuer '+arrow+'</button></nav><p class="lead-flow-footnote">Aucune information financière n’est demandée.</p></section>';
    document.body.appendChild(overlay);screen=overlay.querySelector('#lead-flow-screen');title=overlay.querySelector('#lead-flow-title');hint=overlay.querySelector('#lead-flow-hint');kicker=overlay.querySelector('#lead-flow-kicker');count=overlay.querySelector('#lead-flow-count');progress=overlay.querySelector('#lead-flow-progress');next=overlay.querySelector('#lead-flow-next');back=overlay.querySelector('#lead-flow-back');
    overlay.addEventListener('click',onClick);overlay.addEventListener('keydown',onKeydown);
  }
  function open(trigger){if(!overlay)create();triggerToRestore=trigger||document.activeElement;answers={intent:'',adult:'',level:'',goal:'',commitment:'',nextStep:''};current=0;render();overlay.classList.add('is-open');overlay.setAttribute('aria-hidden','false');document.body.classList.add('lead-flow-lock');window.setTimeout(function(){var choice=screen.querySelector('[data-choice]');if(choice)choice.focus();},40);}
  function close(){if(!overlay)return;overlay.classList.remove('is-open');overlay.setAttribute('aria-hidden','true');document.body.classList.remove('lead-flow-lock');if(triggerToRestore&&triggerToRestore.focus)triggerToRestore.focus();}
  function render(){var q=questions[current];kicker.textContent=current===0?'CHOISIS TON ACCÈS':(current===1?'ÉTAPE IMPORTANTE':'TON PARCOURS · ÉTAPE '+(current+1));title.textContent=q.title;hint.textContent=q.hint;count.textContent=String(current+1).padStart(2,'0')+' / '+String(questions.length).padStart(2,'0');progress.style.width=((current+1)/questions.length*100)+'%';back.hidden=current===0;next.hidden=false;next.disabled=!answers[q.key];next.innerHTML=(current===0?'Continuer vers le formulaire ':current===questions.length-1?'Voir mon orientation ':'Continuer ')+arrow;overlay.querySelector('.lead-flow-nav').hidden=false;overlay.querySelector('.lead-flow-footnote').textContent='Aucune information financière n’est demandée.';
    screen.innerHTML='<div class="lead-flow-options" role="group" aria-label="'+esc(q.title)+'">'+q.options.map(function(option){if(option.direct)return '<a class="lead-flow-option lead-flow-telegram" href="'+esc(LEAD_FLOW_CONFIG.telegramUrl)+'" target="_blank" rel="noopener noreferrer">'+telegramSvg+'<span class="lead-flow-telegram-meta"><strong>'+esc(option.label)+'</strong><small>'+esc(option.detail)+'</small></span>'+arrow+'</a>';var selected=answers[q.key]===option.value;return '<button class="lead-flow-option'+(selected?' is-selected':'')+'" type="button" data-choice="'+esc(option.value)+'" aria-pressed="'+selected+'"><span class="lead-flow-option-copy"><strong>'+esc(option.label)+'</strong><small>'+esc(option.detail)+'</small></span><span class="lead-flow-radio" aria-hidden="true"></span></button>';}).join('')+'</div>'+(current===0?'':'<div class="lead-flow-telegram-extra"><a class="lead-flow-option lead-flow-telegram" href="'+esc(LEAD_FLOW_CONFIG.telegramUrl)+'" target="_blank" rel="noopener noreferrer">'+telegramSvg+'<span class="lead-flow-telegram-meta"><strong>Rejoindre mon canal Telegram</strong><small>'+esc(LEAD_FLOW_CONFIG.telegramSocialProof)+'</small></span>'+arrow+'</a></div>');
    screen.classList.remove('is-refreshing');void screen.offsetWidth;screen.classList.add('is-refreshing');
  }
  function destination(kind){
    overlay.querySelector('.lead-flow-nav').hidden=true;var heading,sub,iconClass,icon,buttonText,url,message='';
    if(kind==='whatsapp'){
      heading='Échange avec un conseiller';sub='Tes réponses sont préparées. Tu peux les relire avant de les envoyer.';iconClass='is-whatsapp';icon=whatsappSvg;buttonText='Parler à un conseiller sur WhatsApp';
      var intent=answers.intent==='formation'?'Je souhaite me former avec '+LEAD_FLOW_CONFIG.academyName:'Je veux être accompagné par '+LEAD_FLOW_CONFIG.academyName;
      message='Bonjour, je souhaite parler à un conseiller. '+intent+'. Mon niveau : '+labels.level[answers.level]+'. Ce que je veux apprendre : '+labels.goal[answers.goal]+'. Je suis majeur et prêt à m’investir sérieusement.';
      url='https://wa.me/'+LEAD_FLOW_CONFIG.whatsappNumber+'?text='+encodeURIComponent(message);
    }else if(kind==='academy'){
      heading='Découvre les accès';sub='Consulte les formules et choisis celle qui correspond à ton parcours.';iconClass='is-academy';icon='<img src="'+esc(LEAD_FLOW_CONFIG.academyLogo)+'" alt="">';buttonText='Voir les accès de l’Académie';url=LEAD_FLOW_CONFIG.academyUrl;
    }else{
      heading='Découvre le canal à ton rythme';sub=kind==='minor'?'Tu peux retrouver le créateur directement sur Telegram.':'Tu pourras revenir lorsque tu seras prêt à t’investir.';iconClass='is-telegram';icon=telegramSvg;buttonText='Rejoindre le canal Telegram';url=LEAD_FLOW_CONFIG.telegramUrl;
    }
    kicker.textContent=kind==='whatsapp'?'ÉCHANGE PRIVÉ':kind==='academy'?'ACCÈS À L’ACADÉMIE':'UNE PREMIÈRE ÉTAPE';title.textContent=heading;hint.textContent=sub;count.textContent='ORIENTATION';progress.style.width='100%';overlay.querySelector('.lead-flow-footnote').textContent=kind==='whatsapp'?'WhatsApp s’ouvrira avec un message prérempli que tu peux modifier avant de l’envoyer.':'Tu vas ouvrir un site externe dans un nouvel onglet.';
    screen.innerHTML='<div class="lead-flow-result"><span class="lead-flow-result-icon '+iconClass+'">'+icon+'</span><span class="lead-flow-result-copy"><small>TA PROCHAINE ÉTAPE</small><strong>'+esc(heading)+'</strong><em>'+esc(sub)+'</em></span></div>'+(message?'<div class="lead-flow-message"><small>MESSAGE PRÉPARÉ</small><p>'+esc(message)+'</p></div>':'')+'<a class="lead-flow-destination '+iconClass+'" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+(kind==='academy'?'<img src="'+esc(LEAD_FLOW_CONFIG.academyLogo)+'" alt="">':icon)+'<span>'+esc(buttonText)+'</span>'+arrow+'</a><button class="lead-flow-restart" type="button" data-restart>Revoir mes réponses</button>';
    screen.classList.remove('is-refreshing');void screen.offsetWidth;screen.classList.add('is-refreshing');var action=screen.querySelector('.lead-flow-destination');if(action)action.focus({preventScroll:true});
  }
  function onClick(event){var closeButton=event.target.closest('[data-close]');if(closeButton){close();return;}var choice=event.target.closest('[data-choice]');if(choice){var q=questions[current];answers[q.key]=choice.dataset.choice;screen.querySelectorAll('[data-choice]').forEach(function(button){var selected=button===choice;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));});next.disabled=false;return;}if(event.target.closest('#lead-flow-next')){var key=questions[current].key;if(!answers[key])return;if(current===1&&answers.adult==='no'){destination('minor');return;}if(current===questions.length-1){destination(answers.nextStep==='start'?'academy':'whatsapp');return;}if(current===questions.length-2&&answers.commitment==='no'){destination('telegram');return;}current++;render();var first=screen.querySelector('[data-choice]');if(first)first.focus();return;}if(event.target.closest('#lead-flow-back')){if(current>0){current--;render();var selected=screen.querySelector('.is-selected')||screen.querySelector('[data-choice]');if(selected)selected.focus();}return;}if(event.target.closest('[data-restart]')){current=0;answers={intent:'',adult:'',level:'',goal:'',commitment:'',nextStep:''};render();var initial=screen.querySelector('[data-choice]');if(initial)initial.focus();}}
  function onKeydown(event){if(event.key==='Escape'){close();return;}if(event.key!=='Tab')return;var nodes=Array.from(overlay.querySelectorAll('button:not([disabled]):not([hidden]),a[href]:not([hidden])')).filter(function(node){return node.offsetParent!==null;});if(!nodes.length)return;var first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  document.querySelectorAll('[data-lead-form]').forEach(function(button){button.addEventListener('click',function(event){event.preventDefault();open(button);});});
})();
