/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Waves, Sparkles, Flame, Cpu, Fingerprint, Activity, MousePointer2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// === Types & Palettes ===
type Particle = {
  id: number;
  type: 'main' | 'ambient';
  x: number; y: number;
  vx: number; vy: number;
  bx: number; by: number;
  r: number; g: number; b: number;
  targetColor: { r: number; g: number; b: number };
  baseColorId: number;
  size: number;
  mass: number;
};

type Mode = 'io' | 'water' | 'space' | 'fire';

const googleColors =[
  { r: 66, g: 133, b: 244, id: 0 }, // Blue
  { r: 234, g: 67, b: 53, id: 1 },  // Red
  { r: 251, g: 188, b: 5, id: 2 },  // Yellow
  { r: 52, g: 168, b: 83, id: 3 }   // Green
];

const palettes = {
  io: googleColors,
  water:[
    { r: 0, g: 150, b: 255 }, { r: 0, g: 255, b: 255 },
    { r: 0, g: 50, b: 255 }, { r: 200, g: 240, b: 255 }
  ],
  space:[
    { r: 180, g: 0, b: 255 }, { r: 255, g: 0, b: 128 },
    { r: 0, g: 200, b: 255 }, { r: 255, g: 255, b: 255 }
  ],
  fire:[
    { r: 255, g: 50, b: 0 }, { r: 255, g: 150, b: 0 },
    { r: 255, g: 200, b: 0 }, { r: 255, g: 255, b: 255 }
  ]
};

const steps =["10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "I/O"];

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uiRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  const animationRef = useRef<number>(0);
  const particles = useRef<Particle[]>([]);
  const gridRef = useRef<Particle[][]>([]);
  
  const [stepIdx, setStepIdx] = useState<number>(0);
  const[mode, setMode] = useState<Mode>('io');

  const physicsRef = useRef({
    mode: 'io',
    stepIdx: 0,
    timeOffset: 0,
    uiRects:[] as { id: string | null; left: number; top: number; right: number; bottom: number; w: number; h: number; cx: number; cy: number; vx: number; vy: number }[],
    mouse: { x: -1000, y: -1000, active: false, vx: 0, vy: 0 },
    events:[] as { type: 'burst', x: number, y: number, force: number }[]
  });

  // === Typography -> Particles ===
  const getTextTargets = useCallback((text: string, width: number, height: number) => {
    if (width === 0 || height === 0) return[];
    const offCanvas = document.createElement('canvas');
    offCanvas.width = width; offCanvas.height = height;
    const ctx = offCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return[];

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'white';
    // Massive font scaling for Keynote feel
    const fontSize = Math.min(width * 0.5, height * 0.7);
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2);

    const imgData = ctx.getImageData(0, 0, width, height).data;
    const newTargets: { x: number; y: number }[] =[];
    
    // Dynamic density sampling based on screen size
    const step = Math.max(Math.floor(width / 250), 3); 

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const index = (y * width + x) * 4;
        if (imgData[index + 1] > 128) { // Check Green channel (faster than calculating average, sufficient for B&W)
          newTargets.push({ 
             x: x + (Math.random() - 0.5) * step, 
             y: y + (Math.random() - 0.5) * step 
          });
        }
      }
    }
    
    // FIX: Shuffle the array to completely eliminate sequential bottom-truncation!
    for (let i = newTargets.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newTargets[i], newTargets[j]] =[newTargets[j], newTargets[i]];
    }

    return newTargets;
  },[]);

  const initParticles = useCallback((width: number, height: number) => {
    const rawTargets = getTextTargets(steps[0], width, height);
    const allParts: Particle[] =[];
    
    // Main Particles (The Shape)
    const mainCount = Math.min(2200, Math.floor((width * height) / 1000));
    for (let i = 0; i < mainCount; i++) {
      const t = rawTargets[i % Math.max(1, rawTargets.length)] || { x: width/2, y: height/2 };
      const baseColor = googleColors[i % 4];
      allParts.push({
        id: i, type: 'main',
        x: width / 2 + (Math.random() - 0.5) * width,
        y: height / 2 + (Math.random() - 0.5) * height,
        vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40,
        bx: t.x, by: t.y,
        r: baseColor.r, g: baseColor.g, b: baseColor.b,
        targetColor: baseColor, baseColorId: baseColor.id,
        size: Math.random() * 1.5 + 1.2,
        mass: Math.random() * 0.5 + 0.5
      });
    }

    // Ambient Particles (The Constellation Dark Matter)
    const ambCount = 800;
    for (let i = 0; i < ambCount; i++) {
      allParts.push({
        id: i + mainCount, type: 'ambient',
        x: Math.random() * width, y: Math.random() * height,
        vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
        bx: 0, by: 0,
        r: 150, g: 150, b: 200,
        targetColor: { r: 100, g: 100, b: 150 }, baseColorId: 0,
        size: Math.random() * 1.2 + 0.3,
        mass: Math.random() * 0.2 + 0.1
      });
    }
    particles.current = allParts;
  }, [getTextTargets]);

  const handleSetMode = useCallback((m: Mode, e?: React.MouseEvent) => {
    if (e && e.clientX && e.clientY) {
      physicsRef.current.events.push({ type: 'burst', x: e.clientX, y: e.clientY, force: 60 });
    }
    setMode(m);
    physicsRef.current.mode = m;
    
    particles.current.forEach(p => {
      if (m === 'io') p.targetColor = palettes.io[p.baseColorId];
      else p.targetColor = palettes[m][Math.floor(Math.random() * palettes[m].length)];
    });
  },[]);

  const triggerNextStep = useCallback((e?: React.MouseEvent | any) => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    if (e && e.clientX && e.clientY) {
      physicsRef.current.events.push({ type: 'burst', x: e.clientX, y: e.clientY, force: 100 });
    } else {
      physicsRef.current.events.push({ type: 'burst', x: width / 2, y: height / 2, force: 150 });
    }
    
    setStepIdx(prev => {
      const nextIdx = (prev + 1) % steps.length;
      physicsRef.current.stepIdx = nextIdx;
      
      if (steps[nextIdx] === "I/O" && physicsRef.current.mode !== 'io') {
        handleSetMode('io');
      }

      // EXPLOSIVE CHAOS before reforming
      particles.current.forEach(p => {
        if (p.type === 'main') {
           const angle = Math.random() * Math.PI * 2;
           const force = Math.random() * 80 + 30;
           p.vx += Math.cos(angle) * force;
           p.vy += Math.sin(angle) * force;
        }
      });
      
      const canvas = canvasRef.current;
      if (canvas) {
        const newTargets = getTextTargets(steps[nextIdx], canvas.width, canvas.height);
        if (newTargets.length > 0) {
          particles.current.forEach((p, i) => {
            if (p.type === 'main') {
               const t = newTargets[i % newTargets.length];
               p.bx = t.x;
               p.by = t.y;
            }
          });
        }
      }
      return nextIdx;
    });
  }, [getTextTargets, handleSetMode]);

  useEffect(() => {
    const timer = setInterval(() => triggerNextStep(), 6000);
    return () => clearInterval(timer);
  }, [triggerNextStep]);

  // === Core Physics Engine ===
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (particles.current.length === 0) initParticles(canvas.width, canvas.height);
      else {
        const newTargets = getTextTargets(steps[physicsRef.current.stepIdx], canvas.width, canvas.height);
        if (newTargets.length > 0) {
          particles.current.forEach((p, i) => {
            if (p.type === 'main') {
              const t = newTargets[i % newTargets.length];
              p.bx = t.x; p.by = t.y;
            }
          });
        }
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const loop = () => {
      physicsRef.current.timeOffset += 0.015;
      const width = canvas.width;
      const height = canvas.height;
      const phys = physicsRef.current;
      const time = phys.timeOffset;

      // Immersive Dynamic Background
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = phys.mode === 'io' ? 'rgba(5, 5, 6, 0.4)' : 
                      phys.mode === 'water' ? 'rgba(2, 6, 15, 0.5)' : 
                      phys.mode === 'space' ? 'rgba(3, 1, 10, 0.4)' : 
                      'rgba(12, 3, 0, 0.4)';
      ctx.fillRect(0, 0, width, height);

      // Flashlight illuminating the dark matter based on mouse
      if (phys.mouse.active) {
        const grd = ctx.createRadialGradient(phys.mouse.x, phys.mouse.y, 0, phys.mouse.x, phys.mouse.y, 400);
        grd.addColorStop(0, phys.mode === 'fire' ? 'rgba(255, 50, 0, 0.08)' : 'rgba(255, 255, 255, 0.04)');
        grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, width, height);
      }
      
      ctx.globalCompositeOperation = phys.mode === 'io' ? 'screen' : 'lighter';

      // Map UI DOM to Canvas Tracking
      const currentRects: any[] = [];
      document.querySelectorAll('[data-ui-element]').forEach(el => {
         const r = el.getBoundingClientRect();
         if (r.width > 0) {
            const id = el.getAttribute('data-ui-element');
            const cx = r.left + r.width/2;
            const cy = r.top + r.height/2;
            const prev = phys.uiRects.find(rect => rect.id === id);
            
            // Calculate velocity of the UI element for interaction physics
            const vx = prev ? cx - prev.cx : 0;
            const vy = prev ? cy - prev.cy : 0;
            
            currentRects.push({ 
               id, left: r.left, top: r.top, right: r.right, bottom: r.bottom, 
               w: r.width, h: r.height, cx, cy, vx, vy
            });
         }
      });
      phys.uiRects = currentRects;

      const allParts = particles.current;

      // Apply Burst Physics
      phys.events.forEach(ev => {
         allParts.forEach(p => {
            const dx = p.x - ev.x; const dy = p.y - ev.y;
            const distSq = dx*dx + dy*dy;
            if (distSq < 400 * 400) {
               const dist = Math.sqrt(distSq) || 1;
               const f = ((400 - dist) / 400) * ev.force;
               p.vx += (dx / dist) * (f / p.mass);
               p.vy += (dy / dist) * (f / p.mass);
            }
         });
      });
      phys.events =[];

      // Build Spatial Grid
      const CELL_SIZE = phys.mode === 'water' ? 30 : 40;
      const cols = Math.ceil(width / CELL_SIZE);
      const rows = Math.ceil(height / CELL_SIZE);
      const totalCells = cols * rows;

      if (gridRef.current.length !== totalCells) gridRef.current = new Array(totalCells).fill(0).map(() =>[]);
      else for (let i = 0; i < totalCells; i++) gridRef.current[i].length = 0;
      const grid = gridRef.current;

      for (let i = 0; i < allParts.length; i++) {
        const p = allParts[i];
        const cx = (p.x / CELL_SIZE) | 0;
        const cy = (p.y / CELL_SIZE) | 0;
        if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) grid[cy * cols + cx].push(p);
      }

      // Physics & Rendering Loop
      for (let i = 0; i < allParts.length; i++) {
        const p = allParts[i];
        let ax = 0, ay = 0;
        let uiGlow = 0; // Soft factor instead of boolean
        
        // --- 1. Generative Target Physics ---
        if (p.type === 'main') {
          const dx = p.bx - p.x; const dy = p.by - p.y;
          const dist = Math.sqrt(dx*dx + dy*dy) || 1;
          
          // Personality: Minor variation in tracking target per main particle
          const trackingModifier = 1 + ((p.id % 10) * 0.05);

          if (phys.mode === 'io') {
            ax += dx * (0.05 * trackingModifier); 
            ay += dy * (0.05 * trackingModifier);
          } else if (phys.mode === 'water') {
            ax += dx * (0.08 * trackingModifier); 
            ay += dy * (0.08 * trackingModifier);
            ay += 0.3 * (1 + ((p.id % 5) * 0.1)); // Nuanced specific buoyancy
            ax += Math.sin(time * 2 + p.y * 0.05) * 1.5;
            ay += Math.cos(time * 2 + p.x * 0.05) * 0.5;
          } else if (phys.mode === 'space') {
            const orbit = 150 / (dist + 5);
            ax += dx * (0.03 * trackingModifier) + Math.cos(time + p.id) * orbit * 0.2;
            ay += dy * (0.03 * trackingModifier) + Math.sin(time + p.id) * orbit * 0.2;
          } else if (phys.mode === 'fire') {
            ax += dx * (0.12 * trackingModifier); 
            ay += dy * (0.12 * trackingModifier);
            if (dy < 10) { ay -= 6.0; ax += (Math.random() - 0.5) * 8; }
            if (p.y < p.by - 100 - Math.random() * 80) { 
              p.y = p.by + 20 + Math.random() * 20; p.x = p.bx + (Math.random() - 0.5) * 20;
              p.vy = 0; p.r = 255; p.g = 255; p.b = 255;
            }
          }
        } else {
          // Ambient Constellation Physics
          // Personality: Distinct swirling speeds and erratic drift for each ambient particle
          const ambientTime = time * (phys.mode === 'fire' ? 1.5 : 0.5) + (p.id * 0.05);
          const swirlForce = 0.15 + ((p.id % 15) * 0.01);
          ax += Math.sin(p.y * 0.01 + ambientTime) * swirlForce;
          ay += Math.cos(p.x * 0.01 + ambientTime) * swirlForce;
          
          if (phys.mode === 'water') {
             ay -= 0.04 + ((p.id % 5) * 0.01); // Varied bubble rising speed
             ax += Math.sin(p.id + time) * 0.05; // Swirling eddies
          } else if (phys.mode === 'fire') {
             ay -= 0.6 + ((p.id % 5) * 0.1); // Staggered spark rising
          } else if (phys.mode === 'space') {
             const dx = p.x - width / 2; const dy = p.y - height / 2;
             const dist = Math.sqrt(dx * dx + dy * dy) || 1;
             ax -= (dy / dist) * (0.2 + (p.id % 10)*0.02); // Galactic swirl with variance
             ay += (dx / dist) * (0.2 + (p.id % 10)*0.02);
             ax -= (dx / dist) * 0.02; // Gentle pull inward
             ay -= (dy / dist) * 0.02;
          }

          if (p.x < -50) p.x = width + 50; if (p.x > width + 50) p.x = -50;
          if (p.y < -50) p.y = height + 50; if (p.y > height + 50) p.y = -50;
        }

        // --- 2. Glassmorphic UI Refraction & Drag Wake ---
        phys.uiRects.forEach(box => {
          if (box.id?.startsWith('hud-')) {
             // Calculate soft distance to the center or edges
             // Approximating a rounded box softly to avoid any sharp edge artifacts
             const dx = Math.max(Math.abs(p.x - box.cx) - box.w / 2 + 20, 0);
             const dy = Math.max(Math.abs(p.y - box.cy) - box.h / 2 + 20, 0);
             const distToEdge = Math.sqrt(dx * dx + dy * dy);
             
             // Dynamic Drag Wake
             const velocitySq = box.vx * box.vx + box.vy * box.vy;
             const isDragging = velocitySq > 1; // Element is moving
             
             if (distToEdge < 60) {
                 // Soft glow value inside and slightly outside the element
                 const glowStrength = Math.max(0, 1 - (distToEdge / 60));
                 uiGlow = Math.max(uiGlow, glowStrength);
                 
                 // Drag interaction: dynamic push/pull
                 if (isDragging) {
                     // Add a trailing force when dragged
                     ax += box.vx * 0.15 * glowStrength;
                     ay += box.vy * 0.15 * glowStrength;
                     
                     // Splash effect splashing particles out of the way
                     const pushDist = Math.max(1, distToEdge);
                     if (p.x > box.cx) ax += (10 / pushDist) * glowStrength;
                     else ax -= (10 / pushDist) * glowStrength;
                     
                     if (p.y > box.cy) ay += (10 / pushDist) * glowStrength;
                     else ay -= (10 / pushDist) * glowStrength;
                     
                 } else if (distToEdge === 0) { // Settled deep inside
                     ax -= p.vx * 0.05; 
                     ay -= p.vy * 0.05;
                 }
             }
          }
        });

        // --- 3. Vortex Mouse Interaction ---
        if (phys.mouse.active) {
          const mdx = p.x - phys.mouse.x; 
          const mdy = p.y - phys.mouse.y;
          const distSq = mdx*mdx + mdy*mdy;
          const radius = phys.mode === 'space' ? 300 : 200;
          
          if (distSq < radius * radius) {
            const dist = Math.sqrt(distSq);
            const force = ((radius - dist) / radius);
            
            // Tornado Vortex Swirl
            ax += (mdy / dist) * force * 20; 
            ay -= (mdx / dist) * force * 20;
            
            // Slight push/pull depending on mode
            if (phys.mode === 'water') {
                ax -= (mdx / dist) * force * 5; ay -= (mdy / dist) * force * 5;
            } else {
                ax += (mdx / dist) * force * 8; ay += (mdy / dist) * force * 8;
            }
          }
        }

        // Velocity & Friction
        p.vx += ax; p.vy += ay;
        // Personality: Introduce very slight varying friction based on assigned mass
        const baseFriction = phys.mode === 'water' ? 0.82 : phys.mode === 'space' ? 0.96 : 0.86;
        const friction = baseFriction - (p.type === 'ambient' ? 0.01 : (p.mass - 0.5) * 0.02);
        p.vx *= friction; p.vy *= friction;

        // Speed Limits
        const speedSq = p.vx * p.vx + p.vy * p.vy;
        if (speedSq > 1200) {
          const s = Math.sqrt(speedSq);
          p.vx = (p.vx / s) * 34; p.vy = (p.vy / s) * 34;
        }

        p.x += p.vx; p.y += p.vy;

        // --- 4. Colors & Rendering ---
        if (p.type === 'main') {
           if (phys.mode === 'fire') {
             const dyForm = p.by - p.y;
             if (dyForm > 15) p.targetColor = { r: 255, g: Math.max(0, 150 - dyForm * 2), b: 0 };
             else p.targetColor = palettes.fire[p.baseColorId];
           } else if (phys.mode === 'io') {
             p.targetColor = googleColors[p.baseColorId];
           }
        } else {
           p.targetColor = phys.mode === 'fire' ? {r: 200, g: 50, b: 0} : {r: 100, g: 150, b: 255};
        }
        
        // Personality: Color transition speeds
        const lerp = p.type === 'ambient' ? (0.015 + ((p.id % 10) * 0.002)) : 0.15;
        
        // Soft Glow blending
        const tr = p.targetColor.r + (255 - p.targetColor.r) * uiGlow;
        const tg = p.targetColor.g + (255 - p.targetColor.g) * uiGlow;
        const tb = p.targetColor.b + (255 - p.targetColor.b) * uiGlow;
        
        p.r += (tr - p.r) * lerp;
        p.g += (tg - p.g) * lerp;
        p.b += (tb - p.b) * lerp;

        // Personality: Rendering variations
        if (p.type === 'main' || uiGlow > 0.5) {
           // Main Particles: focused, stretch based on velocity for motion blur effect
           const alpha = Math.min(0.95 + uiGlow * 0.05, 1.0);
           ctx.fillStyle = `rgba(${p.r | 0}, ${p.g | 0}, ${p.b | 0}, ${alpha})`;
           ctx.beginPath();
           const stretch = Math.min(Math.sqrt(speedSq) * 0.3, 3.0);
           const sizeBonus = uiGlow * 1.5;
           
           if (stretch > 1.2 && phys.mode !== 'water') {
               const angle = Math.atan2(p.vy, p.vx);
               ctx.ellipse(p.x, p.y, (p.size * stretch) + sizeBonus, p.size + sizeBonus, angle, 0, Math.PI * 2);
           } else {
               ctx.arc(p.x, p.y, p.size + sizeBonus, 0, Math.PI * 2);
           }
           ctx.fill();
        } else {
           // Ambient Particles: Nebulous, twinkling, drifting dust
           const pulse = Math.sin(time * 2 + p.id * 0.1) * 0.5 + 0.5; // 0 to 1
           const opacity = Math.min(0.05 + pulse * 0.35 + ((p.id % 5) * 0.05) + uiGlow * 0.5, 1); 
           let sizePulse = p.size * (0.8 + pulse * 0.4);
           sizePulse += uiGlow;
           
           ctx.fillStyle = `rgba(${p.r | 0}, ${p.g | 0}, ${p.b | 0}, ${opacity})`;
           ctx.beginPath();
           ctx.arc(p.x, p.y, sizePulse, 0, Math.PI * 2);
           ctx.fill();
        }

        // --- 5. Spatial Interactions (Plexus & SPH) ---
        // Optimization: Only run N-body on a subset or every few frames
        if (i % 2 === 0) {
           const cx = (p.x / CELL_SIZE) | 0;
           const cy = (p.y / CELL_SIZE) | 0;
           
           for (let dx = -1; dx <= 1; dx++) {
             for (let dy = -1; dy <= 1; dy++) {
               const nx = cx + dx, ny = cy + dy;
               if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                 const cell = grid[ny * cols + nx];
                 for (let j = 0; j < cell.length; j++) {
                   const p2 = cell[j];
                   if (p.id >= p2.id) continue;
                   
                   const distSq = (p.x - p2.x)**2 + (p.y - p2.y)**2;
                   
                   // Draw Plexus web for Ambient particles near mouse or UI
                   if (p.type === 'ambient' && p2.type === 'ambient' && distSq < 4000) {
                      ctx.beginPath();
                      ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y);
                      ctx.strokeStyle = `rgba(${p.r|0}, ${p.g|0}, ${p.b|0}, ${0.15 - (distSq/4000)*0.15})`;
                      ctx.lineWidth = 0.5; ctx.stroke();
                   }
                   
                   // Core Mode Plexus inside the number
                   else if (phys.mode === 'io' && p.type === 'main' && distSq < 300 && p.baseColorId === p2.baseColorId) {
                      ctx.beginPath();
                      ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y);
                      ctx.strokeStyle = `rgba(${p.r|0}, ${p.g|0}, ${p.b|0}, ${0.4 - (distSq/300)*0.4})`;
                      ctx.lineWidth = 1; ctx.stroke();
                   } 
                   
                   // Fluid Dynamics (SPH)
                   else if (phys.mode === 'water' && p.type === 'main' && distSq < CELL_SIZE*CELL_SIZE) {
                      const dist = Math.sqrt(distSq);
                      const force = (1 - dist / CELL_SIZE) * 1.5;
                      const fx = ((p.x - p2.x) / dist) * force;
                      const fy = ((p.y - p2.y) / dist) * force;
                      p.vx += fx; p.vy += fy;
                      p2.vx -= fx; p2.vy -= fy;
                   }
                 }
               }
             }
           }
        }
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [initParticles, getTextTargets]);

  // Track Mouse velocity & position
  useEffect(() => {
    let lastX = 0, lastY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      physicsRef.current.mouse.vx = e.clientX - lastX;
      physicsRef.current.mouse.vy = e.clientY - lastY;
      physicsRef.current.mouse.x = e.clientX;
      physicsRef.current.mouse.y = e.clientY;
      physicsRef.current.mouse.active = true;
      lastX = e.clientX; lastY = e.clientY;
    };
    const handleMouseLeave = () => physicsRef.current.mouse.active = false;
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  },[]);

  return (
    <div ref={containerRef} className="relative w-full h-screen overflow-hidden bg-black font-sans text-white selection:bg-white/10">
      
      <canvas 
        ref={canvasRef} 
        onClick={triggerNextStep}
        className="absolute inset-0 z-0 cursor-crosshair touch-none"
      />

      {/* Ambient Interaction Hint */}
      <div className="absolute inset-0 pointer-events-none z-10 flex items-end justify-center pb-32 mix-blend-screen opacity-50">
        <div className="flex flex-col items-center gap-3 font-mono text-[10px] uppercase tracking-[0.4em] text-white/50">
          <MousePointer2 className="w-4 h-4 animate-bounce text-white" />
          <span>Drag elements • Swirl cursor • Click to Detonate</span>
        </div>
      </div>

      {/* --- GENERATIVE HUD OVERLAYS --- */}
      {/* 
        The CSS here uses `bg-white/5 backdrop-blur-md` 
        to perfectly sync with the Canvas Refraction underneath it!
      */}

      {/* Brand Hologram */}
      <motion.div 
        data-ui-element="hud-brand"
        drag dragConstraints={containerRef} dragElastic={0.05} whileDrag={{ scale: 1.05 }}
        ref={el => { uiRefs.current[0] = el; }}
        className="absolute top-10 left-10 pointer-events-auto cursor-grab active:cursor-grabbing p-6 flex flex-col gap-1 z-20 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 shadow-[0_0_40px_rgba(255,255,255,0.05)] transition-colors hover:bg-white/10 hover:border-white/20"
      >
        <div className="font-bold tracking-[0.4em] text-xs uppercase flex items-center gap-3 text-white">
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,1)] animate-pulse" />
          I/O 2026
        </div>
        <div className="text-[9px] font-mono tracking-widest text-white/50 mt-1 flex items-center gap-2">
          <Activity className="w-3 h-3" /> FLUID ENGINE
        </div>
        <div className="text-[8px] uppercase tracking-[0.5em] text-white/30 mt-4 flex items-center gap-2 border-t border-white/10 pt-2">
          <Fingerprint className="w-3 h-3" /> Draggable
        </div>
      </motion.div>

      {/* Telemetry / Sequence */}
      <motion.div 
        data-ui-element="hud-sequence"
        drag dragConstraints={containerRef} dragElastic={0.05} whileDrag={{ scale: 1.05 }}
        ref={el => { uiRefs.current[1] = el; }}
        className="absolute top-10 right-10 pointer-events-auto cursor-grab active:cursor-grabbing p-6 flex items-center gap-8 z-20 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 shadow-[0_0_40px_rgba(255,255,255,0.05)] transition-colors hover:bg-white/10 hover:border-white/20"
      >
        <div className="flex flex-col items-end">
          <span className="text-[9px] uppercase tracking-[0.4em] font-bold text-white/40">Sync State</span>
          <AnimatePresence mode="popLayout">
            <motion.span 
              key={stepIdx}
              initial={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
              className="text-4xl font-mono font-light leading-none mt-2 text-white"
            >
              {steps[stepIdx]}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="w-[1px] h-12 bg-white/20" />
        <div className="flex flex-col gap-2">
           <div className="text-[8px] font-mono text-white/40 tracking-widest">PARTICLES: 3.0K</div>
           <div className="text-[8px] font-mono text-white/40 tracking-widest">VORTEX: ACTIVE</div>
        </div>
      </motion.div>

      {/* State Injectors (Bottom Dock) */}
      <motion.div 
        data-ui-element="hud-dock"
        drag dragConstraints={containerRef} dragElastic={0.05} whileDrag={{ scale: 1.02 }}
        ref={el => { uiRefs.current[2] = el; }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-auto cursor-grab active:cursor-grabbing flex items-center gap-4 p-4 z-20 bg-white/5 backdrop-blur-xl rounded-full border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition-colors hover:bg-white/10"
      >
        <ModeHologram id="btn-io" active={mode === 'io'} onClick={(e) => handleSetMode('io', e)} icon={<Cpu className="w-5 h-5"/>} label="Core" />
        <ModeHologram id="btn-water" active={mode === 'water'} onClick={(e) => handleSetMode('water', e)} icon={<Waves className="w-5 h-5"/>} label="Fluid" />
        <ModeHologram id="btn-space" active={mode === 'space'} onClick={(e) => handleSetMode('space', e)} icon={<Sparkles className="w-5 h-5"/>} label="Cosmic" />
        <ModeHologram id="btn-fire" active={mode === 'fire'} onClick={(e) => handleSetMode('fire', e)} icon={<Flame className="w-5 h-5"/>} label="Thermal" />
      </motion.div>

    </div>
  );
}

// === Holographic Button Component ===
function ModeHologram({ id, active, onClick, icon, label }: { id: string, active: boolean; onClick: (e: React.MouseEvent) => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      data-ui-element={id}
      onClick={onClick}
      className={`group relative flex items-center gap-3 px-6 py-3 rounded-full transition-all duration-700 overflow-hidden ${
        active ? 'bg-white/15 border border-white/30 text-white shadow-[0_0_30px_rgba(255,255,255,0.1)] scale-105' : 'bg-transparent border border-transparent text-white/40 hover:text-white/80 hover:bg-white/5'
      }`}
    >
      <div className={`relative z-10 transition-transform duration-500 ${active ? 'animate-pulse' : 'group-hover:scale-110'}`}>
        {icon}
      </div>
      <span className="relative z-10 text-[10px] font-bold uppercase tracking-[0.3em]">{label}</span>
      
      {/* Active Mode Highlight Flare */}
      {active && (
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] animate-[shimmer_2s_infinite]" />
      )}
    </button>
  );
}
