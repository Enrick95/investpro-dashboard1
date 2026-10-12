'use client';

import { useState } from 'react';
import { Bot, ExternalLink, Globe2, Newspaper, Sparkles } from 'lucide-react';
import { currencies, pairs } from '@/lib/fundamentals/catalog';

export default function FundamentalAnalysis() {
  const [pair, setPair] = useState('CHFJPY');
  const base = pair.slice(0, 3);
  const quote = pair.slice(3);

  return (
    <div className="fa-workspace">
      <section className="fa-hero">
        <div>
          <span className="fa-eyebrow"><Globe2 size={15} /> LE CONTEXTE AVANT LE TRADE</span>
          <h2>Une analyse claire.<br /><em>Quand elle sera prête.</em></h2>
          <p>Nous préparons un assistant qui pourra analyser une paire ou un indice, expliquer les facteurs macroéconomiques et appuyer ses observations sur des sources vérifiables.</p>
        </div>
        <div className="fa-search">
          <span className="fa-coming-soon"><Sparkles size={15} /> Bientôt disponible</span>
          <label htmlFor="fa-pair">Instrument prévu</label>
          <select id="fa-pair" value={pair} onChange={(event) => setPair(event.target.value)}>
            {pairs.map((item) => <option key={item} value={item}>{item.slice(0, 3)} / {item.slice(3)}{item === 'XAUUSD' ? ' · GOLD' : ''}</option>)}
          </select>
          <button className="fa-primary" type="button" disabled aria-disabled="true"><Bot size={18} /> Assistant en préparation</button>
          <span className="fa-meta">Aucune analyse payante n’est lancée pour le moment.</span>
        </div>
      </section>

      <section className="fa-card fa-roadmap" aria-label="Fonctions prévues">
        <div className="fa-roadmap-heading"><span className="fa-roadmap-icon"><Bot size={21} /></span><div><span className="fa-eyebrow">ASSISTANT IA DE MARCHÉ</span><h3>Ce qui se prépare</h3></div></div>
        <div className="fa-roadmap-grid">
          <div><strong>01</strong><h4>Choisir un instrument</h4><p>Indiquez une paire de devises ou un indice à étudier.</p></div>
          <div><strong>02</strong><h4>Lire le contexte</h4><p>Retrouvez les publications économiques et les facteurs qui peuvent compter.</p></div>
          <div><strong>03</strong><h4>Comprendre les scénarios</h4><p>Une synthèse sourcée, avec ses incertitudes clairement expliquées.</p></div>
        </div>
      </section>

      <div className="fa-currencies">
        {[base, quote].map((code, index) => (
          <section className="fa-card" key={code}>
            <span className="fa-eyebrow">{index === 0 ? '01 · DEVISE DE BASE' : '02 · DEVISE DE COTATION'}</span>
            <div className="fa-currency-title"><h3>{code}</h3><span>{currencies[code].name}</span></div>
            <p>{currencies[code].focus}</p>
            <a href={currencies[code].url} target="_blank" rel="noopener noreferrer">{currencies[code].bank}<ExternalLink size={15} /></a>
          </section>
        ))}
      </div>

      <div className="fa-footer"><span><Newspaper size={14} /> En attendant, consultez les sources officielles des devises.</span><a href="https://fr.investing.com/economic-calendar/" target="_blank" rel="noopener noreferrer">Calendrier économique <ExternalLink size={14} /></a></div>
    </div>
  );
}
