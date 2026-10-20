import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  RotateCcw,
  Layers,
  Info,
  X,
  Server,
  Cpu,
  Zap,
  HardDrive,
  Network,
  ShieldCheck,
  Wrench,
  AlertTriangle,
  Award,
  Eye
} from 'lucide-react';

export interface HardwareComponentInfo {
  id: string;
  name: string;
  category: string;
  badge: string;
  fieldExperience: string;
  commonFailures: string[];
  credentials: string[];
  specs: Record<string, string>;
  positionOffset?: { x: number; y: number; z: number };
}

const HARDWARE_CATALOG: Record<string, HardwareComponentInfo> = {
  pdu: {
    id: 'pdu',
    name: 'Dual Redundant Vertical PDU Strips (30A L6-30P)',
    category: 'Power Distribution & UPS',
    badge: 'Power / A-Feed + B-Feed',
    fieldExperience:
      'Configured and balanced dual 208V/30A APC & Eaton switched rack PDUs across 40+ server enclosures. Performed phase load balancing, remote outlet power cycling via SNMP/SSH, and thermal telemetry integration.',
    commonFailures: [
      'Phase overload & circuit breaker trips during cold boot spikes',
      'C13/C19 locking plug retention lock failure causing physical disconnect',
      'NMC (Network Management Card) lockup requiring hard pinhole reset'
    ],
    credentials: ['Datacenter Power Management', 'Eaton/APC Certified', 'SLA Emergency Power Recovery'],
    specs: {
      Voltage: '208V / 240V 3-Phase',
      Capacity: '2x 30A (10.0 kW Total)',
      Outlets: '24x C13 + 6x C19 Locking',
      Monitoring: 'Individual Outlet Metering & SNMPv3'
    }
  },
  patch_panel: {
    id: 'patch_panel',
    name: '48-Port Cat6A Shielded Patch Panel & OM4 Fiber Tray',
    category: 'Structured Cabling & Physical Layer',
    badge: 'Network Layer 1',
    fieldExperience:
      'Punched down over 2,000+ T-568B Cat6A drops and terminated OM4 LC fiber duplex cassettes. Performed Fluke DSX-8000 certification testing for 10GbE Alien Crosstalk compliance.',
    commonFailures: [
      '10G link negotiation drop down to 100Mbps due to pin 3/6 split-pair crimp',
      'Fiber optic end-face contamination causing >3.5dB attenuation loss',
      'Krone punch-down clip oxidation in humid IDF switch closets'
    ],
    credentials: ['Structured Cabling Expert', 'Fluke Certified Cable Tester', 'T-568A/B & Fiber Splice Qualified'],
    specs: {
      Standard: 'Cat6A STP / 10GBASE-T',
      Density: '48 Ports in 1U Rackspace',
      Fiber: 'OM4 Multimode LC Duplex Cassette',
      Bandwidth: '500 MHz Frequency Rating'
    }
  },
  raid_array: {
    id: 'raid_array',
    name: '2U 24-Bay SAS 12G NVMe RAID Storage Enclosure',
    category: 'Storage & Infrastructure',
    badge: 'RAID 6 / Hot-Swap SAS',
    fieldExperience:
      'Managed Dell PowerVault & HPE MSA storage arrays with hardware RAID 6 + Hot Spare. Executed non-disruptive hot-swap drive replacements, controller firmware upgrades, and background rebuild monitoring.',
    commonFailures: [
      'Predictive drive failure (SMART reallocated sector threshold breached)',
      'RAID controller battery backup unit (BBU / Supercap) degradation',
      'Dual-disk fault in RAID 5 leading to array degradation / data loss risk'
    ],
    credentials: ['Dell / HPE Enterprise Storage Specialist', 'ZFS & Hardware RAID Engineer', 'Disaster Recovery Lead'],
    specs: {
      Capacity: '24x 2.5" Hot-Swap SAS/NVMe Bays',
      Controller: 'Dual Active-Active SAS 12Gb/s HBA',
      Throughput: 'Up to 12.8 GB/s Read Speed',
      Redundancy: 'RAID 0/1/5/6/10/50/60 + Hot Spare'
    }
  },
  core_switch: {
    id: 'core_switch',
    name: '48-Port 10G SFP+ Managed Core Switch',
    category: 'Networking & Routing',
    badge: '10G / L2/L3 Switching',
    fieldExperience:
      'Deployed Cisco Catalyst / Aruba CX 10G switch stacks with LACP EtherChannel trunks, VRRP gateway redundancy, and 802.1X Dynamic VLAN assignments for enterprise offices.',
    commonFailures: [
      'SFP+ optical transceiver flapping due to thermal throttling',
      'Spanning Tree Protocol (STP) loop from rogue unmanaged switch connection',
      'Flash memory corruption during sudden power loss during OS upgrade'
    ],
    credentials: ['CCNA / Network Enterprise Deployment', '802.1X Port Security Specialist', 'VLAN / VRRP Architect'],
    specs: {
      Ports: '48x 10G SFP+ / 4x 100G QSFP28 Uplinks',
      Switching: '1.76 Tbps Non-Blocking Fabric',
      Features: 'L3 OSPF, BGP, VRRP, LACP, PoE+ Support',
      Latency: '< 800 nanoseconds Ultra-Low'
    }
  },
  server_blade: {
    id: 'server_blade',
    name: '2U Dual Xeon Enterprise Hypervisor Node',
    category: 'Compute & Virtualization',
    badge: 'VMware ESXi / Proxmox Node',
    fieldExperience:
      'Provisioned and maintained multi-node VMware ESXi & Proxmox clusters hosting Windows Server DCs, Linux microservices, and Kubernetes worker nodes with iDRAC/iLO Out-of-Band management.',
    commonFailures: [
      'DIMM Uncorrectable ECC Error forcing node memory isolation',
      'High CPU thermal throttling caused by dried thermal paste or fan failure',
      'iDRAC / iLO flash chip wear out requiring motherboard replacement'
    ],
    credentials: ['Proxmox / VMware Certified Professional', 'iDRAC Enterprise Admin', 'SysAdmin Hardware Lead'],
    specs: {
      CPU: '2x Intel Xeon Scalable 32-Core',
      RAM: '512GB DDR5 Registered ECC',
      Management: 'Dedicated iDRAC 9 Enterprise Port',
      Power: 'Dual 1100W 80-Plus Titanium Redundant'
    }
  },
  cpu_socket: {
    id: 'cpu_socket',
    name: 'LGA 4189 / 1700 High-Density CPU Socket & VRM',
    category: 'Motherboard Architecture',
    badge: 'Processor & Power Delivery',
    fieldExperience:
      'Performed precision processor upgrades, socket pin inspection with jeweler optical loupes, VRM thermal pad replacement, and liquid cooler mounting for zero-thermal-throttle stability.',
    commonFailures: [
      'Bent LGA socket pins caused by improper processor drops',
      'VRM MOSFET failure resulting in CPU VCORE voltage short circuit',
      'Uneven cooler mounting pressure causing memory channel dropouts'
    ],
    credentials: ['Hardware Diagnostic Specialist', 'Board-Level Inspection Certified', 'Overclocking & Thermal Tuning'],
    specs: {
      Socket: 'LGA 4189 (Socket P+)',
      Pins: '4,189 Gold-Plated Contact Pins',
      VRM: '16+2 Phase Digital DrMOS 105A Stage',
      Capacitors: '20,000 Hours Japanese Solid Polymer'
    }
  }
};

export const HardwareShowcase3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selectedComp, setSelectedComp] = useState<HardwareComponentInfo | null>(HARDWARE_CATALOG['raid_array']);
  const [viewMode, setViewMode] = useState<'rack' | 'motherboard'>('rack');
  const [isAutoRotate, setIsAutoRotate] = useState<boolean>(true);
  const [exploded, setExploded] = useState<number>(0);
  const [hoveredCompName, setHoveredCompName] = useState<string | null>(null);
  const [controlsCollapsed, setControlsCollapsed] = useState<boolean>(false);

  // Refs for 3D instance objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const interactiveMeshesRef = useRef<THREE.Mesh[]>([]);
  const componentsGroupRef = useRef<THREE.Group | null>(null);
  const explodedRef = useRef<number>(0);
  explodedRef.current = exploded;

  useEffect(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.025);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(2.8, 1.8, 3.8);
    cameraRef.current = camera;

    // 3. Renderer with Studio PBR & Shadows
    const isHeadless = typeof navigator !== 'undefined' && (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isHeadless ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !isHeadless;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    // 4. Studio Environment Reflection Map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 5. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't go far below floor
    controls.minDistance = 1.2;
    controls.maxDistance = 8.0;
    controls.autoRotate = isAutoRotate;
    controls.autoRotateSpeed = 1.5;
    controlsRef.current = controls;

    // 6. Lighting Rig
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x38bdf8, 2.5);
    keyLight.position.set(4, 6, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xa855f7, 1.5);
    fillLight.position.set(-4, 3, -2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x34d399, 1.2);
    rimLight.position.set(0, 5, -4);
    scene.add(rimLight);

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.8);
    scene.add(hemiLight);

    // Ground Plane with Grid and Contact Shadow
    const gridHelper = new THREE.GridHelper(10, 20, 0x38bdf8, 0x334155);
    gridHelper.position.y = -1.45;
    scene.add(gridHelper);

    const shadowPlaneGeo = new THREE.PlaneGeometry(6, 6);
    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
      depthWrite: false
    });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.44;
    scene.add(shadowPlane);

    // Group for holding hardware components
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);
    componentsGroupRef.current = rootGroup;

    // Helper Materials
    const metalDarkMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.25
    });
    const aluminumMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.9,
      roughness: 0.2
    });
    const blackPlasticMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.2,
      roughness: 0.4
    });
    const pcbGreenMat = new THREE.MeshStandardMaterial({
      color: 0x065f46,
      metalness: 0.3,
      roughness: 0.3
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.95,
      roughness: 0.15
    });
    const blueLedMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const greenLedMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const amberLedMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

    const interactiveMeshes: THREE.Mesh[] = [];

    // BUILD SCENE ACCORDING TO VIEWMODE
    if (viewMode === 'rack') {
      // 42U SERVER RACK
      const rackWidth = 1.0;
      const rackHeight = 2.8;
      const rackDepth = 1.2;

      // Outer Frame
      const frameGeo = new THREE.BoxGeometry(rackWidth, rackHeight, rackDepth);
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x0b0f19,
        metalness: 0.8,
        roughness: 0.3,
        wireframe: false
      });
      const frameMesh = new THREE.Mesh(frameGeo, frameMat);
      frameMesh.position.y = 0;
      frameMesh.castShadow = true;
      frameMesh.receiveShadow = true;
      rootGroup.add(frameMesh);

      // Vertical Rails (Corner Pillars)
      const railGeo = new THREE.BoxGeometry(0.06, rackHeight + 0.02, 0.06);
      const corners = [
        [-rackWidth / 2 + 0.03, rackDepth / 2 - 0.03],
        [rackWidth / 2 - 0.03, rackDepth / 2 - 0.03],
        [-rackWidth / 2 + 0.03, -rackDepth / 2 + 0.03],
        [rackWidth / 2 - 0.03, -rackDepth / 2 + 0.03]
      ];
      corners.forEach(([cx, cz]) => {
        const rail = new THREE.Mesh(railGeo, aluminumMat);
        rail.position.set(cx, 0, cz);
        rootGroup.add(rail);
      });

      // 1. Dual Vertical PDU Strips (Rear Left and Rear Right)
      const pduGeo = new THREE.BoxGeometry(0.08, 2.4, 0.08);
      const pduMat = new THREE.MeshStandardMaterial({
        color: 0x1e1b4b,
        metalness: 0.7,
        roughness: 0.3
      });
      const pduMeshLeft = new THREE.Mesh(pduGeo, pduMat);
      pduMeshLeft.position.set(-rackWidth / 2 + 0.08, 0, -rackDepth / 2 + 0.1);
      pduMeshLeft.userData = { componentId: 'pdu', defaultY: 0, explosionFactor: { x: -0.8, y: 0, z: -0.4 } };
      pduMeshLeft.castShadow = true;
      rootGroup.add(pduMeshLeft);
      interactiveMeshes.push(pduMeshLeft);

      // Add PDU Outlet Nodes
      for (let i = -1.0; i <= 1.0; i += 0.25) {
        const outlet = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.04), blackPlasticMat);
        outlet.position.set(-rackWidth / 2 + 0.08, i, -rackDepth / 2 + 0.14);
        rootGroup.add(outlet);
      }

      // 2. Patch Panel (Top 1U)
      const patchPanelGeo = new THREE.BoxGeometry(0.88, 0.12, 0.2);
      const patchPanelMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.8,
        roughness: 0.2
      });
      const patchPanelMesh = new THREE.Mesh(patchPanelGeo, patchPanelMat);
      patchPanelMesh.position.set(0, 1.1, rackDepth / 2 - 0.12);
      patchPanelMesh.userData = { componentId: 'patch_panel', defaultY: 1.1, explosionFactor: { x: 0, y: 0.8, z: 0.6 } };
      patchPanelMesh.castShadow = true;
      rootGroup.add(patchPanelMesh);
      interactiveMeshes.push(patchPanelMesh);

      // Ethernet Ports on Patch Panel
      for (let px = -0.38; px <= 0.38; px += 0.08) {
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.02), goldMat);
        port.position.set(px, 1.1, rackDepth / 2 - 0.01);
        rootGroup.add(port);
      }

      // 3. Core Switch (1U below patch panel)
      const switchGeo = new THREE.BoxGeometry(0.88, 0.12, 0.7);
      const switchMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        metalness: 0.85,
        roughness: 0.2
      });
      const switchMesh = new THREE.Mesh(switchGeo, switchMat);
      switchMesh.position.set(0, 0.9, rackDepth / 2 - 0.37);
      switchMesh.userData = { componentId: 'core_switch', defaultY: 0.9, explosionFactor: { x: 0, y: 0.5, z: 0.5 } };
      switchMesh.castShadow = true;
      rootGroup.add(switchMesh);
      interactiveMeshes.push(switchMesh);

      // SFP LEDs
      for (let px = -0.35; px <= 0.35; px += 0.06) {
        const ledMat = Math.random() > 0.3 ? greenLedMat : amberLedMat;
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), ledMat);
        led.position.set(px, 0.9, rackDepth / 2 - 0.01);
        rootGroup.add(led);
      }

      // 4. RAID Storage Array (2U Middle)
      const raidGeo = new THREE.BoxGeometry(0.88, 0.26, 0.8);
      const raidMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.9,
        roughness: 0.2
      });
      const raidMesh = new THREE.Mesh(raidGeo, raidMat);
      raidMesh.position.set(0, 0.5, rackDepth / 2 - 0.42);
      raidMesh.userData = { componentId: 'raid_array', defaultY: 0.5, explosionFactor: { x: 0, y: 0, z: 0.8 } };
      raidMesh.castShadow = true;
      rootGroup.add(raidMesh);
      interactiveMeshes.push(raidMesh);

      // Drive Bays
      for (let row = 0; row < 2; row++) {
        for (let col = -0.38; col <= 0.38; col += 0.08) {
          const bayGeo = new THREE.BoxGeometry(0.06, 0.09, 0.02);
          const bayMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
          const bay = new THREE.Mesh(bayGeo, bayMat);
          bay.position.set(col, 0.56 - row * 0.11, rackDepth / 2 - 0.01);
          rootGroup.add(bay);

          // LED status
          const statusLed = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.005), blueLedMat);
          statusLed.position.set(col + 0.02, 0.56 - row * 0.11, rackDepth / 2 - 0.002);
          rootGroup.add(statusLed);
        }
      }

      // 5. Server Blades (Multiple 2U servers in lower rack)
      const bladeYPositions = [0.1, -0.3, -0.7, -1.1];
      bladeYPositions.forEach((by, idx) => {
        const bladeGeo = new THREE.BoxGeometry(0.88, 0.24, 0.85);
        const bladeMat = new THREE.MeshStandardMaterial({
          color: idx === 0 ? 0x0f172a : 0x1e293b,
          metalness: 0.85,
          roughness: 0.3
        });
        const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
        bladeMesh.position.set(0, by, rackDepth / 2 - 0.44);
        bladeMesh.userData = { componentId: 'server_blade', defaultY: by, explosionFactor: { x: 0, y: by * 0.5, z: 0.7 } };
        bladeMesh.castShadow = true;
        rootGroup.add(bladeMesh);
        interactiveMeshes.push(bladeMesh);

        // Server Power Button & Indicator LEDs
        const pwrBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 12), aluminumMat);
        pwrBtn.rotation.x = Math.PI / 2;
        pwrBtn.position.set(-0.38, by, rackDepth / 2 - 0.01);
        rootGroup.add(pwrBtn);

        const activeLed = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), greenLedMat);
        activeLed.position.set(-0.34, by, rackDepth / 2 - 0.01);
        rootGroup.add(activeLed);
      });
    } else {
      // MODULAR MOTHERBOARD VIEW
      const boardWidth = 2.4;
      const boardHeight = 0.06;
      const boardDepth = 2.0;

      // PCB Base
      const pcbGeo = new THREE.BoxGeometry(boardWidth, boardHeight, boardDepth);
      const pcbMesh = new THREE.Mesh(pcbGeo, pcbGreenMat);
      pcbMesh.position.set(0, 0, 0);
      pcbMesh.castShadow = true;
      pcbMesh.receiveShadow = true;
      rootGroup.add(pcbMesh);

      // 1. CPU Socket (LGA 1700)
      const socketGeo = new THREE.BoxGeometry(0.6, 0.08, 0.6);
      const socketMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.3, roughness: 0.4 });
      const socketMesh = new THREE.Mesh(socketGeo, socketMat);
      socketMesh.position.set(-0.4, 0.06, -0.2);
      socketMesh.userData = { componentId: 'cpu_socket', defaultY: 0.06, explosionFactor: { x: -0.3, y: 0.8, z: 0 } };
      socketMesh.castShadow = true;
      rootGroup.add(socketMesh);
      interactiveMeshes.push(socketMesh);

      // Gold pins grid simulation inside socket
      const pinPlate = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.01, 0.48), goldMat);
      pinPlate.position.set(-0.4, 0.1, -0.2);
      rootGroup.add(pinPlate);

      // 2. VRM Heatsink & Power Delivery
      const vrmGeo = new THREE.BoxGeometry(0.2, 0.25, 0.8);
      const vrmMesh = new THREE.Mesh(vrmGeo, aluminumMat);
      vrmMesh.position.set(-0.9, 0.15, -0.2);
      vrmMesh.castShadow = true;
      rootGroup.add(vrmMesh);

      // 3. DDR5 RAM Slots (4 Slots)
      for (let r = 0; r < 4; r++) {
        const ramSlotGeo = new THREE.BoxGeometry(0.06, 0.1, 0.8);
        const ramSlotMesh = new THREE.Mesh(ramSlotGeo, blackPlasticMat);
        ramSlotMesh.position.set(0.1 + r * 0.1, 0.08, -0.2);
        rootGroup.add(ramSlotMesh);

        // Inserted RAM Stick
        const ramStickGeo = new THREE.BoxGeometry(0.02, 0.22, 0.76);
        const ramStickMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.8, roughness: 0.2 });
        const ramStick = new THREE.Mesh(ramStickGeo, ramStickMat);
        ramStick.position.set(0.1 + r * 0.1, 0.2, -0.2);
        rootGroup.add(ramStick);
      }

      // 4. PCIe 5.0 x16 Slots
      const pcieSlots = [-0.2, -0.6];
      pcieSlots.forEach((pz, idx) => {
        const pcieGeo = new THREE.BoxGeometry(1.2, 0.08, 0.08);
        const pcieMat = new THREE.MeshStandardMaterial({ color: idx === 0 ? 0x0284c7 : 0x1e293b, metalness: 0.7 });
        const pcieMesh = new THREE.Mesh(pcieGeo, pcieMat);
        pcieMesh.position.set(-0.1, 0.08, pz + 0.6);
        rootGroup.add(pcieMesh);
      });

      // 5. RAID Storage Controller / Chipset Heatsink
      const chipsetGeo = new THREE.BoxGeometry(0.4, 0.15, 0.4);
      const chipsetMesh = new THREE.Mesh(chipsetGeo, metalDarkMat);
      chipsetMesh.position.set(0.6, 0.1, 0.5);
      chipsetMesh.userData = { componentId: 'raid_array', defaultY: 0.1, explosionFactor: { x: 0.6, y: 0.6, z: 0.3 } };
      chipsetMesh.castShadow = true;
      rootGroup.add(chipsetMesh);
      interactiveMeshes.push(chipsetMesh);
    }

    interactiveMeshesRef.current = interactiveMeshes;

    // Raycasting & Pointer Interactivity
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveMeshes, false);

      if (intersects.length > 0) {
        const hitObj = intersects[0].object as THREE.Mesh;
        const compId = hitObj.userData.componentId;
        const compInfo = HARDWARE_CATALOG[compId];
        if (compInfo) {
          setHoveredCompName(compInfo.name);
          renderer.domElement.style.cursor = 'pointer';
        }
      } else {
        setHoveredCompName(null);
        renderer.domElement.style.cursor = 'default';
      }
    };

    const handleClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveMeshes, false);

      if (intersects.length > 0) {
        const hitObj = intersects[0].object as THREE.Mesh;
        const compId = hitObj.userData.componentId;
        const compInfo = HARDWARE_CATALOG[compId];
        if (compInfo) {
          setSelectedComp(compInfo);
        }
      }
    };

    renderer.domElement.addEventListener('mousemove', handlePointerMove);
    renderer.domElement.addEventListener('click', handleClick);

    // Animation Render Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      controls.update();

      // Apply Exploded View Interpolation smoothly
      interactiveMeshes.forEach((mesh) => {
        const defaultY = mesh.userData.defaultY || 0;
        const exp = mesh.userData.explosionFactor || { x: 0, y: 0.5, z: 0.5 };
        const currentExp = explodedRef.current;

        mesh.position.y = THREE.MathUtils.damp(mesh.position.y, defaultY + exp.y * currentExp, 6, 0.016);
        if (exp.x !== 0) {
          mesh.position.x = THREE.MathUtils.damp(mesh.position.x, exp.x * currentExp, 6, 0.016);
        }
        if (exp.z !== 0 && viewMode === 'rack') {
          mesh.position.z = THREE.MathUtils.damp(mesh.position.z, 0.48 + exp.z * currentExp, 6, 0.016);
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    // Handle Window Resize
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth || 800;
      const h = mountRef.current.clientHeight || 500;

      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousemove', handlePointerMove);
      renderer.domElement.removeEventListener('click', handleClick);
      cancelAnimationFrame(animationFrameId);

      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [viewMode]);

  // Handle Auto Rotate Change
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = isAutoRotate;
    }
  }, [isAutoRotate]);

  const resetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(2.8, 1.8, 3.8);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#0b0f19',
        borderRadius: '16px',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        position: 'relative',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      {/* Top Header & View Selector */}
      <div
        style={{
          padding: '1rem 1.25rem',
          backgroundColor: '#0f172a',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              padding: '0.4rem',
              borderRadius: '8px',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8'
            }}
          >
            <Server size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
              Interactive 3D Hardware Infrastructure Showcase
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
              Rotate, zoom, explode layers &amp; click components to inspect field experience &amp; credentials
            </p>
          </div>
        </div>

        {/* View Switch Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', backgroundColor: '#1e293b', padding: '0.25rem', borderRadius: '8px' }}>
          <button
            onClick={() => setViewMode('rack')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: viewMode === 'rack' ? '#0284c7' : 'transparent',
              color: viewMode === 'rack' ? '#ffffff' : '#94a3b8',
              transition: 'all 0.2s ease'
            }}
          >
            <Server size={14} /> 42U Server Rack
          </button>
          <button
            onClick={() => setViewMode('motherboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: viewMode === 'motherboard' ? '#0284c7' : 'transparent',
              color: viewMode === 'motherboard' ? '#ffffff' : '#94a3b8',
              transition: 'all 0.2s ease'
            }}
          >
            <Cpu size={14} /> Modular PC Motherboard
          </button>
        </div>
      </div>

      {/* Main 3D Canvas Container */}
      <div style={{ position: 'relative', width: '100%', height: '520px' }}>
        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

        {/* Hover Badge Indicator */}
        {hoveredCompName && (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid #38bdf8',
              color: '#38bdf8',
              padding: '0.4rem 1rem',
              borderRadius: '20px',
              fontSize: '0.85rem',
              fontWeight: 600,
              pointerEvents: 'none',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 4px 20px rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Eye size={14} /> Click to Inspect: {hoveredCompName}
          </div>
        )}

        {/* Selected Component Drawer Modal */}
        {selectedComp && (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              bottom: controlsCollapsed ? '16px' : '90px',
              width: 'min(380px, 90vw)',
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '12px',
              padding: '1.25rem',
              overflowY: 'auto',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              animation: 'fadeIn 0.25s ease-out'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid rgba(56, 189, 248, 0.3)'
                  }}
                >
                  {selectedComp.badge}
                </span>
                <h4 style={{ margin: '0.4rem 0 0.1rem', fontSize: '1.15rem', color: '#f8fafc', lineHeight: 1.3 }}>
                  {selectedComp.name}
                </h4>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{selectedComp.category}</span>
              </div>
              <button
                onClick={() => setSelectedComp(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '0.2rem'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Field Experience */}
            <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.7)', padding: '0.75rem', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                <Wrench size={15} /> Field Experience &amp; Deployment
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                {selectedComp.fieldExperience}
              </p>
            </div>

            {/* Failure Modes */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f59e0b', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                <AlertTriangle size={15} /> Common Failure Modes &amp; Triage
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {selectedComp.commonFailures.map((fail, i) => (
                  <li key={i}>{fail}</li>
                ))}
              </ul>
            </div>

            {/* Credentials */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#a855f7', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                <Award size={15} /> Troubleshooting Credentials
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {selectedComp.credentials.map((cred, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: '0.72rem',
                      padding: '0.2rem 0.5rem',
                      backgroundColor: 'rgba(168, 85, 247, 0.15)',
                      color: '#c084fc',
                      borderRadius: '4px',
                      border: '1px solid rgba(168, 85, 247, 0.3)'
                    }}
                  >
                    {cred}
                  </span>
                ))}
              </div>
            </div>

            {/* Specs Table */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.75rem' }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Technical Specs:</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: '0.4rem' }}>
                {Object.entries(selectedComp.specs).map(([k, v]) => (
                  <div key={k} style={{ backgroundColor: '#0f172a', padding: '0.35rem 0.5rem', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{k}</div>
                    <div style={{ fontSize: '0.75rem', color: '#e2e8f0', fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Horizontal Control Dock */}
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(900px, 94%)',
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            padding: '0.6rem 1.25rem',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap'
          }}
        >
          {/* Exploded View Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: '220px' }}>
            <Layers size={16} style={{ color: '#38bdf8' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap' }}>
              Exploded View:
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={exploded}
              onChange={(e) => setExploded(parseFloat(e.target.value))}
              style={{
                flex: 1,
                accentColor: '#38bdf8',
                cursor: 'pointer'
              }}
            />
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', width: '32px' }}>
              {Math.round(exploded * 100)}%
            </span>
          </div>

          {/* Utility Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setIsAutoRotate(!isAutoRotate)}
              style={{
                backgroundColor: isAutoRotate ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)',
                border: isAutoRotate ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                color: isAutoRotate ? '#38bdf8' : '#94a3b8',
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <RotateCcw size={13} /> {isAutoRotate ? 'Spin On' : 'Spin Off'}
            </button>

            <button
              onClick={resetCamera}
              style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#e2e8f0',
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Reset View
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
