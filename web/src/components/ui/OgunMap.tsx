'use client';

import { motion } from 'framer-motion';

const LGAS = [
  { id: 'imeko-afon',        name: 'Imeko Afon',        x: 35,  y: 35,  r: 3.5, major: false },
  { id: 'yewa-north',        name: 'Yewa North',        x: 72,  y: 55,  r: 3.5, major: false },
  { id: 'yewa-south',        name: 'Yewa South',        x: 62,  y: 115, r: 3.5, major: false },
  { id: 'ipokia',            name: 'Ipokia',            x: 28,  y: 130, r: 3,   major: false },
  { id: 'ewekoro',           name: 'Ewekoro',           x: 128, y: 92,  r: 3.5, major: false },
  { id: 'abeokuta-north',    name: 'Abeokuta North',    x: 112, y: 62,  r: 4,   major: false },
  { id: 'abeokuta-south',    name: 'Abeokuta South',    x: 128, y: 84,  r: 6,   major: true,  capital: true },
  { id: 'odeda',             name: 'Odeda',             x: 152, y: 44,  r: 3.5, major: false },
  { id: 'obafemi-owode',     name: 'Obafemi Owode',     x: 170, y: 108, r: 4,   major: false },
  { id: 'ifo',               name: 'Ifo',               x: 152, y: 148, r: 4,   major: false },
  { id: 'ado-odo-ota',       name: 'Ado-Odo/Ota',       x: 96,  y: 165, r: 4.5, major: true  },
  { id: 'remo-north',        name: 'Remo North',        x: 236, y: 75,  r: 3.5, major: false },
  { id: 'ikenne',            name: 'Ikenne',            x: 256, y: 100, r: 3.5, major: false },
  { id: 'sagamu',            name: 'Sagamu',            x: 258, y: 128, r: 5,   major: true  },
  { id: 'ijebu-north',       name: 'Ijebu North',       x: 282, y: 60,  r: 4,   major: false },
  { id: 'ijebu-ne',          name: 'Ijebu N/East',      x: 324, y: 48,  r: 3,   major: false },
  { id: 'ijebu-east',        name: 'Ijebu East',        x: 348, y: 98,  r: 3.5, major: false },
  { id: 'ijebu-ode',         name: 'Ijebu Ode',         x: 298, y: 148, r: 4.5, major: true  },
  { id: 'odogbolu',          name: 'Odogbolu',          x: 314, y: 180, r: 3.5, major: false },
  { id: 'ogun-waterside',    name: 'Ogun Waterside',    x: 356, y: 228, r: 3.5, major: false },
];

const EDGES = [
  ['imeko-afon', 'yewa-north'],
  ['imeko-afon', 'abeokuta-north'],
  ['yewa-north', 'yewa-south'],
  ['yewa-north', 'abeokuta-north'],
  ['yewa-south', 'ipokia'],
  ['yewa-south', 'ado-odo-ota'],
  ['yewa-south', 'ewekoro'],
  ['ewekoro', 'abeokuta-south'],
  ['ewekoro', 'obafemi-owode'],
  ['abeokuta-north', 'abeokuta-south'],
  ['abeokuta-north', 'odeda'],
  ['abeokuta-south', 'odeda'],
  ['abeokuta-south', 'obafemi-owode'],
  ['odeda', 'remo-north'],
  ['obafemi-owode', 'ifo'],
  ['obafemi-owode', 'sagamu'],
  ['ifo', 'ado-odo-ota'],
  ['ifo', 'sagamu'],
  ['remo-north', 'ikenne'],
  ['remo-north', 'ijebu-north'],
  ['ikenne', 'sagamu'],
  ['ikenne', 'ijebu-north'],
  ['sagamu', 'ijebu-ode'],
  ['ijebu-north', 'ijebu-ne'],
  ['ijebu-north', 'ijebu-ode'],
  ['ijebu-ne', 'ijebu-east'],
  ['ijebu-east', 'ijebu-ode'],
  ['ijebu-east', 'odogbolu'],
  ['ijebu-ode', 'odogbolu'],
  ['odogbolu', 'ogun-waterside'],
];

const lgaMap = Object.fromEntries(LGAS.map((l) => [l.id, l]));

const LABEL_LGAS = ['abeokuta-south', 'sagamu', 'ado-odo-ota', 'ijebu-ode', 'imeko-afon'];

interface Props {
  className?: string;
  dim?: boolean;
}

export function OgunMap({ className = '', dim = false }: Props) {
  return (
    <svg
      viewBox="0 0 390 270"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ opacity: dim ? 0.55 : 1 }}
    >
      <defs>
        {/* Forest glow filter */}
        <filter id="forestGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Gold glow filter */}
        <filter id="goldGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Radial gradient for capital */}
        <radialGradient id="capitalGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e6b044" stopOpacity="1" />
          <stop offset="100%" stopColor="#C8962A" stopOpacity="0.8" />
        </radialGradient>
        {/* Radial gradient for major */}
        <radialGradient id="majorGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2a8a50" stopOpacity="1" />
          <stop offset="100%" stopColor="#1A6B3C" stopOpacity="0.8" />
        </radialGradient>
        {/* Line gradient */}
        <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1A6B3C" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#1A6B3C" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#1A6B3C" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* Connection edges */}
      {EDGES.map(([a, b], i) => {
        const la = lgaMap[a];
        const lb = lgaMap[b];
        if (!la || !lb) return null;
        return (
          <motion.line
            key={`${a}-${b}`}
            x1={la.x} y1={la.y}
            x2={lb.x} y2={lb.y}
            stroke="url(#lineGrad)"
            strokeWidth={0.7}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.5 + i * 0.04, ease: 'easeOut' }}
          />
        );
      })}

      {/* Capital halo ring */}
      {LGAS.filter((l) => l.capital).map((lga) => (
        <motion.circle
          key={`halo-${lga.id}`}
          cx={lga.x} cy={lga.y} r={16}
          fill="none"
          stroke="rgba(200,150,42,0.15)"
          strokeWidth={1}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.15, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        />
      ))}

      {/* Nodes */}
      {LGAS.map((lga, i) => (
        <g key={lga.id}>
          {/* Outer pulse ring for major cities */}
          {lga.major && !lga.capital && (
            <motion.circle
              cx={lga.x} cy={lga.y} r={lga.r + 4}
              fill="none"
              stroke="rgba(26,107,60,0.2)"
              strokeWidth={0.8}
              animate={{ r: [lga.r + 4, lga.r + 8, lga.r + 4], opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
            />
          )}

          {/* Node body */}
          <motion.circle
            cx={lga.x} cy={lga.y} r={lga.r}
            fill={lga.capital ? 'url(#capitalGrad)' : lga.major ? 'url(#majorGrad)' : 'rgba(26,107,60,0.65)'}
            filter={lga.capital ? 'url(#goldGlow)' : lga.major ? 'url(#forestGlow)' : undefined}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 1 + i * 0.06, type: 'spring', stiffness: 300 }}
          />

          {/* Pulse animation on node */}
          <motion.circle
            cx={lga.x} cy={lga.y} r={lga.r}
            fill={lga.capital ? 'rgba(200,150,42,0.4)' : 'rgba(26,107,60,0.4)'}
            animate={{
              r: [lga.r, lga.r + (lga.capital ? 5 : 3), lga.r],
              opacity: [0.6, 0, 0.6],
            }}
            transition={{
              duration: lga.capital ? 2.5 : 3.5,
              repeat: Infinity,
              ease: 'easeOut',
              delay: 1.5 + i * 0.15,
            }}
          />
        </g>
      ))}

      {/* Labels for key cities */}
      {LGAS.filter((l) => LABEL_LGAS.includes(l.id)).map((lga) => (
        <motion.text
          key={`label-${lga.id}`}
          x={lga.x + (lga.x > 200 ? -(lga.name.length * 3.2 + 6) : lga.r + 6)}
          y={lga.y + 1}
          fontSize={lga.capital ? 7 : 6}
          fontFamily="var(--font-jakarta, system-ui)"
          fontWeight={lga.capital ? '700' : '500'}
          fill={lga.capital ? '#e6b044' : 'rgba(255,255,255,0.5)'}
          dominantBaseline="middle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5 + LGAS.indexOf(lga) * 0.1 }}
        >
          {lga.name}
        </motion.text>
      ))}
    </svg>
  );
}
