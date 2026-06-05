'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, useTexture, Environment } from '@react-three/drei';
import { useRef, Suspense, useMemo } from 'react';
import * as THREE from 'three';

/* Logo card — uses the actual brand mark as a texture on a thin extruded
   rounded panel, so we get an accurate brand shape with real depth + lighting. */
function LogoCard() {
  const meshRef = useRef<THREE.Mesh>(null);
  const { mouse } = useThree();
  const texture = useTexture('/logo-icon.png');

  /* Rounded square geometry, extruded for thickness */
  const geometry = useMemo(() => {
    const size = 2.4;
    const radius = 0.18;
    const shape = new THREE.Shape();
    const x = -size / 2;
    const y = -size / 2;
    shape.moveTo(x + radius, y);
    shape.lineTo(x + size - radius, y);
    shape.quadraticCurveTo(x + size, y, x + size, y + radius);
    shape.lineTo(x + size, y + size - radius);
    shape.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
    shape.lineTo(x + radius, y + size);
    shape.quadraticCurveTo(x, y + size, x, y + size - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);

    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.18,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.04,
      bevelThickness: 0.04,
      curveSegments: 16,
    });
  }, []);

  /* Texture tweaks for crispness */
  useMemo(() => {
    if (texture) {
      texture.anisotropy = 8;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
    }
  }, [texture]);

  /* Slow spin + mouse parallax */
  useFrame((_, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += delta * 0.22;
    const targetX = mouse.y * 0.25;
    const targetZ = mouse.x * 0.18;
    meshRef.current.rotation.x += (targetX - meshRef.current.rotation.x) * 0.05;
    meshRef.current.rotation.z += (-targetZ - meshRef.current.rotation.z) * 0.05;
  });

  return (
    <Float speed={1.4} rotationIntensity={0.2} floatIntensity={0.6} floatingRange={[-0.08, 0.08]}>
      <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          map={texture}
          metalness={0.35}
          roughness={0.45}
          envMapIntensity={0.9}
        />
      </mesh>
    </Float>
  );
}

/* Drifting gold orbs in the background — adds depth + brand colour */
function FloatingOrbs() {
  const groupRef = useRef<THREE.Group>(null);
  const orbs = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    position: [
      (Math.random() - 0.5) * 7,
      (Math.random() - 0.5) * 5,
      -2 - Math.random() * 3,
    ] as [number, number, number],
    scale: 0.04 + Math.random() * 0.08,
    speed: 0.2 + Math.random() * 0.4,
    offset: i * 0.5,
  })), []);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.children.forEach((child, i) => {
      const o = orbs[i];
      child.position.y += Math.sin(state.clock.elapsedTime * o.speed + o.offset) * 0.002;
      child.position.x += Math.cos(state.clock.elapsedTime * o.speed * 0.5 + o.offset) * 0.0015;
    });
  });

  return (
    <group ref={groupRef}>
      {orbs.map((o, i) => (
        <mesh key={i} position={o.position} scale={o.scale}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color="#D4A843" transparent opacity={0.55} />
        </mesh>
      ))}
    </group>
  );
}

/* Canvas wrapper — sized by parent. Set parent's CSS w/h before mounting. */
export function HeroLogo3D({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          {/* Forest-green key + warm gold rim, sits well over the jungle bg */}
          <ambientLight intensity={0.55} />
          <directionalLight
            position={[5, 4, 5]}
            intensity={1.1}
            color="#FFF3D9"
            castShadow
          />
          <pointLight position={[-4, -2, -3]} intensity={0.6} color="#1A6B3C" />
          <pointLight position={[3, -3, 2]} intensity={0.4} color="#D4A843" />

          <Environment preset="sunset" environmentIntensity={0.4} />

          <LogoCard />
          <FloatingOrbs />
        </Suspense>
      </Canvas>
    </div>
  );
}
