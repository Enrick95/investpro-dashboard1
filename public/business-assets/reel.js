(()=>{'use strict';const site=document.getElementById('site-content');
      function initHeroReel(){
        var reel=site.querySelector('[data-hero-reel]');if(!reel)return;
        var stage=reel.querySelector('.biz-reel-stage'),track=reel.querySelector('.biz-reel-track'),groups=Array.from(track.querySelectorAll('.biz-reel-group')),reduced=window.matchMedia('(prefers-reduced-motion: reduce)'),dock=site.querySelector('.biz-mobile-dock'),paused=false,visible=false,raf=0,geometry=[],width=0,baseOffset=0,cycleWidth=0,travel=0,lastTime=0;
        function measure(){
          var previousCycle=cycleWidth;var progress=previousCycle?travel/previousCycle:0;
          width=stage.clientWidth;var firstGroup=groups[0],primary=firstGroup?Array.from(firstGroup.querySelectorAll('.biz-reel-frame')):[];
          cycleWidth=firstGroup?firstGroup.offsetWidth:track.scrollWidth/Math.max(1,groups.length);
          track.style.setProperty('--reel-cycle-width',Math.max(1,cycleWidth)+'px');
          geometry=[];groups.forEach(function(group){var groupLeft=group.offsetLeft;Array.from(group.querySelectorAll('.biz-reel-frame')).forEach(function(frame){geometry.push({node:frame,x:groupLeft+frame.offsetLeft+frame.offsetWidth/2});});});
          var centerFrame=primary[Math.floor(primary.length/2)];baseOffset=width/2-(firstGroup&&centerFrame?firstGroup.offsetLeft+centerFrame.offsetLeft+centerFrame.offsetWidth/2:0);
          travel=progress*cycleWidth;
        }
        function draw(offset){
          var center=width/2,radius=Math.max(360,width*.5),verticalCurve=width<=640?150:(width<=1200?170:150);
          track.style.transform='translate3d('+offset.toFixed(2)+'px,-50%,0)';
          geometry.forEach(function(item){var delta=item.x+offset-center,angle=Math.max(-.82,Math.min(.82,delta/radius)),projected=radius*Math.sin(angle),depth=-50+radius*(1-Math.cos(angle))*.75,vertical=-(1-Math.cos(angle))*verticalCurve,scale=1+(1-Math.cos(angle))*.7,yaw=-angle*180/Math.PI;item.node.style.transform='translate3d('+(projected-delta).toFixed(2)+'px,'+vertical.toFixed(2)+'px,'+depth.toFixed(2)+'px) rotateY('+yaw.toFixed(2)+'deg) scale('+scale.toFixed(4)+')';});
        }
        function animate(now){if(!raf)return;if(lastTime){travel=(travel+(now-lastTime)*(cycleWidth/42000))%Math.max(1,cycleWidth);}lastTime=now;draw(baseOffset-travel);raf=requestAnimationFrame(animate);}
        function sync(){var shouldAnimate=visible&&!paused&&!document.hidden&&!reduced.matches;reel.classList.toggle('is-orbiting',shouldAnimate);if(shouldAnimate&&!raf){lastTime=0;raf=requestAnimationFrame(animate);}else if(!shouldAnimate&&raf){cancelAnimationFrame(raf);raf=0;lastTime=0;draw(baseOffset-travel);}else if(!shouldAnimate){draw(baseOffset-travel);}}
        var pauseButton=site.querySelector('[data-reel-pause]');
        if(pauseButton){pauseButton.addEventListener('click',function(){paused=!paused;pauseButton.setAttribute('aria-pressed',String(paused));pauseButton.textContent=paused?'Animer la galerie':'Mettre la galerie en pause';sync();});pauseButton.hidden=reduced.matches;}
        measure();draw(baseOffset-travel);
        if('IntersectionObserver'in window){var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){visible=entry.isIntersecting;sync();if(dock&&window.matchMedia('(max-width: 640px)').matches)site.classList.toggle('is-hero-past',!visible&&entry.boundingClientRect.bottom<0);});},{threshold:.12});observer.observe(reel);}else{visible=true;sync();}
        window.addEventListener('resize',function(){measure();draw(baseOffset-travel);sync();},{passive:true});document.addEventListener('visibilitychange',sync);if(reduced.addEventListener)reduced.addEventListener('change',sync);else reduced.addListener(sync);
      }

initHeroReel();})();
