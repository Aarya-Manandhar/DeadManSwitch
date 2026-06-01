import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { encryptFile, decryptFile, wrapKeyForStorage, toBase64, fromBase64 } from './encryption';
import { MetaMaskSDK } from '@metamask/sdk';

// Initialize SDK once
const mmsdk = new MetaMaskSDK({
  dappMetadata: {
    name: "Dead Man's Vault",
    url: window.location.href,
  },
  logging: { developerMode: false },
});

// ── Constants ──────────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = "0x805029D6eBf0631Ef5Af0c9FE1e5a092a8a8e03B";

const FACTORY_ADDRESS = "0x9406Cc6185a346906296840746125a0E44976454";

const CONTRACT_ABI = [
  { "inputs": [], "name": "checkIn", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "internalType": "string", "name": "_ipfsCid", "type": "string" }, { "internalType": "string", "name": "_encryptedKey", "type": "string" }, { "internalType": "address", "name": "_beneficiary", "type": "address" }, { "internalType": "uint256", "name": "_seconds", "type": "uint256" }], "name": "createVault", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "deleteVault", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "internalType": "string", "name": "_newIpfsCid", "type": "string" }, { "internalType": "string", "name": "_newEncryptedKey", "type": "string" }], "name": "updateVault", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "_owner", "type": "address" }], "name": "claimVault", "outputs": [{ "internalType": "string", "name": "", "type": "string" }, { "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "getAvailableVaults", "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "_owner", "type": "address" }], "name": "getTimeRemaining", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "_owner", "type": "address" }], "name": "isTimerExpired", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "", "type": "address" }], "name": "vaults", "outputs": [{ "name": "ipfsCid", "type": "string" }, { "name": "encryptedKey", "type": "string" }, { "name": "beneficiary", "type": "address" }, { "name": "timePeriod", "type": "uint256" }, { "name": "lastCheckIn", "type": "uint256" }, { "name": "exists", "type": "bool" }], "stateMutability": "view", "type": "function" }
];



const FACTORY_ABI = [
  { inputs: [{ name: "owner", type: "address" }, { name: "salt", type: "uint256" }], name: "getAddress", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
];

const ROLE = { LOADING: 'loading', NEW: 'new', OWNER: 'owner', BENEFICIARY: 'beneficiary' };

// ── Shared Provider Logic ──────────────────────────────────────────────────
let sharedProvider = null;
const getProvider = async (forcePublic = false) => {
  // Use a high-reliability public RPC for identity isolation
  if (forcePublic) {
    return new ethers.JsonRpcProvider("https://1rpc.io/sepolia");
  }

  if (sharedProvider) return sharedProvider;

  const ethereum = mmsdk.getProvider();
  if (ethereum) {
    sharedProvider = new ethers.BrowserProvider(ethereum);
    return sharedProvider;
  }

  return new ethers.JsonRpcProvider("https://1rpc.io/sepolia");
};





// ── Inline Styles (Glassmorphism Dark Theme) ───────────────────────────────
const S = {
  root: { minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1117 50%, #0a0f1e 100%)', fontFamily: "'Inter', 'Segoe UI', sans-serif", color: '#e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' },
  hero: { textAlign: 'center', marginBottom: '48px' },
  heroTitle: { fontSize: '3rem', fontWeight: 800, background: 'linear-gradient(135deg, #a78bfa, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, letterSpacing: '-1px' },
  heroSub: { color: '#94a3b8', marginTop: '12px', fontSize: '1.05rem' },
  card: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', backdropFilter: 'blur(20px)', padding: '36px', width: '100%', maxWidth: '560px', marginBottom: '24px' },
  cardTitle: { fontSize: '1.25rem', fontWeight: 700, marginBottom: '24px', marginTop: 0, color: '#f1f5f9' },
  input: { width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', color: '#f1f5f9', fontSize: '0.95rem', marginBottom: '14px', boxSizing: 'border-box', outline: 'none' },
  btnPrimary: { width: '100%', padding: '14px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.2s', marginTop: '8px' },
  btnGoogle: { width: '100%', padding: '14px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#f1f5f9', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' },
  btnGreen: { width: '100%', padding: '14px', background: 'linear-gradient(135deg, #059669, #10b981)', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '1rem', fontWeight: 700, cursor: 'pointer' },
  btnAmber: { width: '100%', padding: '14px', background: 'linear-gradient(135deg, #d97706, #f59e0b)', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '1rem', fontWeight: 700, cursor: 'pointer' },
  btnRed: { width: '100%', padding: '14px', background: 'linear-gradient(135deg, #ef4444, #b91c1c)', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', marginTop: '12px' },
  badge: { display: 'inline-block', padding: '4px 12px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '16px' },
  addressBox: { background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: '10px', padding: '10px 14px', fontSize: '0.78rem', color: '#c4b5fd', wordBreak: 'break-all', marginBottom: '14px' },
  predictBox: { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '10px', padding: '10px 14px', fontSize: '0.78rem', color: '#6ee7b7', wordBreak: 'break-all', marginBottom: '14px' },
  status: { padding: '12px 16px', borderRadius: '10px', fontSize: '0.9rem', marginBottom: '20px', textAlign: 'center' },
  pulse: { width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 20px', animation: 'pulse 2s infinite' },
  label: { fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px', display: 'block' },
  divider: { border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)', margin: '20px 0' },
  vaultRow: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '16px', marginBottom: '12px' },
  timerText: { fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b', textAlign: 'center', margin: '8px 0' },
  header: { width: '100%', maxWidth: '560px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  profileBadge: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' },
  avatar: { width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' },
  btnLogout: { background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function shortenAddr(a) { return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ''; }
function secsToDuration(s) {
  if (s < 60) return `${s}s`;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : (h > 0 ? `${h}h ${m}m ${sc}s` : `${m}m ${sc}s`);
}


// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [account, setAccount] = useState(null);
  const [role, setRole] = useState(null);
  const [vaultData, setVaultData] = useState(null);
  const [benefVaults, setBenefVaults] = useState([]);
  const [timeRemaining, setTimeRemaining] = useState(null);

  const [file, setFile] = useState(null);
  const [password, setPassword] = useState('');
  const [benefEmail, setBenefEmail] = useState('');
  const [timerDays, setTimerDays] = useState('');
  const [predictedAddr, setPredicted] = useState('');
  const [manualBenefAddr, setManualBenef] = useState('');
  const [useManualAddr, setUseManual] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [unlockedVault, setUnlockedVault] = useState(null); // Stores {cid, key}
  const [claimPassword, setClaimPassword] = useState('');


  useEffect(() => {
    if (role === ROLE.OWNER && timeRemaining > 0) {
      const id = setInterval(() => setTimeRemaining(r => Math.max(0, r - 1)), 1000);
      return () => clearInterval(id);
    }
  }, [role, timeRemaining]);



  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState('info');
  const [isLoading, setIsLoading] = useState(false);

  const showStatus = (msg, type = 'info') => { setStatusMsg(msg); setStatusType(type); };

  const [googleUser, setGoogleUser] = useState(null);

  useEffect(() => {
    if (window.google) {
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
        callback: handleGoogleResponse,
      });
    }
  }, []);

  const handleGoogleResponse = async (response) => {
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    setGoogleUser(payload);
    showStatus(`Signed in as ${payload.email}. Mapping to Smart Account…`, 'success');

    const emailHash = ethers.keccak256(ethers.toUtf8Bytes(payload.email));

    // Derive deterministic owner from hash
    const deterministicOwner = ethers.getAddress(ethers.dataSlice(emailHash, 12));
    console.log("👤 Derived EOA Owner:", deterministicOwner);

    const salt = BigInt(emailHash);
    let smartAccount;

    try {
      const provider = await getProvider(true); 
      const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
      
      console.log("🏗️ Calling Factory at:", FACTORY_ADDRESS);
      smartAccount = await factory.getAddress(deterministicOwner, salt);
      console.log("✨ Factory returned Smart Account:", smartAccount);
      
    } catch (err) {
      console.error("❌ Factory Call Failed!", err);
      smartAccount = deterministicOwner;
      console.log("⚠️ Using Fallback Address:", smartAccount);
    }

    if (smartAccount.toLowerCase() === FACTORY_ADDRESS.toLowerCase()) {
      console.error("🚨 CRITICAL: Prediction returned Factory Address! Overriding with EOA.");
      smartAccount = deterministicOwner;
    }

    setAccount(smartAccount);
    showStatus(`Connected as ${payload.email}`, 'success');
    await detectRole(smartAccount, payload);
  };


  const loginWithGoogle = () => {
    if (window.google && import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      window.google.accounts.id.prompt();
    } else {
      const demoEmail = window.prompt("Google Client ID not configured. Enter an email to use for Demo Sign-In:", "aaryamanandhar2003@gmail.com");
      if (demoEmail) {
        handleGoogleResponse({
          credential: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify({
            email: demoEmail,
            name: demoEmail.split('@')[0],
            picture: `https://ui-avatars.com/api/?name=${demoEmail}`
          }))}.dummy-signature`
        });
      }
    }
  };

  const connect = async () => {
    setIsLoading(true);
    sharedProvider = null;
    showStatus('Opening MetaMask SDK connection…', 'info');
    try {
      const ethereum = mmsdk.getProvider();
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts returned from MetaMask");
      }

      setAccount(accounts[0]);
      showStatus('Detecting your role…', 'info');
      await detectRole(accounts[0]);
    } catch (err) {
      console.error(err);
      showStatus('Connection failed. Please restart MetaMask if stuck.', 'error');
    }
    setIsLoading(false);
  };

  const disconnect = () => {
    setAccount(null);
    setRole(null);
    setGoogleUser(null);
    setVaultData(null);
    setBenefVaults([]);
    setTimeRemaining(null);
    showStatus('Disconnected.', 'info');
  };

  const detectRole = async (addr, googleUserOverride = null) => {
    if (!addr) return;
    setRole(ROLE.LOADING);
    setBenefVaults([]); // Clear previous beneficiary data
    
    const isGoogle = !!(googleUserOverride || googleUser);
    console.log(`🔍 [${isGoogle ? 'GOOGLE' : 'METAMASK'}] Detecting role for:`, addr);
    
    try {
      const provider = await getProvider(isGoogle);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      // 1. Check if they are an OWNER
      const vault = await contract.vaults(addr);
      console.log(`🏠 Owner Check for ${addr}: exists = ${vault.exists}`);

      if (vault.exists) {
        setVaultData({ ipfsCid: vault.ipfsCid, encryptedKey: vault.encryptedKey, beneficiary: vault.beneficiary, timePeriod: Number(vault.timePeriod), lastCheckIn: Number(vault.lastCheckIn) });
        try {
          const rem = await contract.getTimeRemaining(addr);
          setTimeRemaining(Number(rem));
        } catch (timerErr) { }
        showStatus('Vault active. You are the Owner.', 'success');
        setRole(ROLE.OWNER);
        return;
      }

      // 2. Check if they are a BENEFICIARY
      // We explicitly pass 'from' to ensure msg.sender is correct in the view call
      const availableVaults = await contract.getAvailableVaults.staticCall({ from: addr });
      console.log(`🎁 Beneficiary Check for ${addr}: Found ${availableVaults?.length || 0} vaults`);

      if (availableVaults && availableVaults.length > 0) {
        setBenefVaults(availableVaults);
        setRole(ROLE.BENEFICIARY);
        showStatus(`You are a beneficiary for ${availableVaults.length} vault(s).`, 'success');
        return;
      }

      // 3. Otherwise, they are a NEW user
      setRole(ROLE.NEW);
      showStatus('No vault found. Create one below.', 'info');
    } catch (e) {
      console.error("❌ Role detection error:", e);
      setRole(ROLE.NEW);
      showStatus('Could not load vault data. Are you on Sepolia?', 'error');
    }
  };

  const predictAddress = useCallback(async (email) => {
    if (!email.includes('@')) { setPredicted(''); return; }
    setIsPredicting(true);
    try {
      const emailHash = ethers.keccak256(ethers.toUtf8Bytes(email));
      const deterministicOwner = ethers.getAddress(ethers.dataSlice(emailHash, 12));
      const salt = BigInt(emailHash);

      let addr;
      try {
        const provider = await getProvider(true);
        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        addr = await factory.getAddress(deterministicOwner, salt);
        
        // Safety check: don't let it return the factory address
        if (addr.toLowerCase() === FACTORY_ADDRESS.toLowerCase()) {
          addr = deterministicOwner;
        }
      } catch (e) {
        addr = deterministicOwner;
      }
      
      setPredicted(addr);
    } catch {
      const h = ethers.keccak256(ethers.toUtf8Bytes(email));
      setPredicted(ethers.getAddress('0x' + h.slice(-40)));
    }
    setIsPredicting(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (benefEmail) predictAddress(benefEmail); }, 700);
    return () => clearTimeout(t);
  }, [benefEmail, predictAddress]);

  const checkIn = async () => {
    setIsLoading(true);
    showStatus('Sending check-in transaction...', 'info');
    try {
      const provider = await getProvider();
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.checkIn();
      await tx.wait();
      showStatus('Check-in confirmed! Timer reset.', 'success');
      await detectRole(account);
    } catch (e) {
      console.error(e);
      showStatus(`Transaction failed: ${e.message}`, 'error');
    }
    setIsLoading(false);
  };

  const deleteVault = async () => {
    if (!window.confirm("WARNING: This will permanently delete your vault from the blockchain and unpin your file from IPFS. Continue?")) return;
    setIsLoading(true);
    showStatus('🗑️ Deleting vault from blockchain...', 'info');
    try {
      const provider = await getProvider();
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const tx = await contract.deleteVault();
      await tx.wait();
      showStatus('✅ Blockchain record removed. Unpinning from IPFS...', 'info');

      // Pinata Unpin
      if (vaultData && vaultData.ipfsCid) {
        try {
          const pinataJwt = import.meta.env.VITE_PINATA_JWT;
          const unpinRes = await fetch(`https://api.pinata.cloud/pinning/unpin/${vaultData.ipfsCid}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${pinataJwt}` }
          });
          if (unpinRes.ok) {
            showStatus('🗑️ Vault fully destroyed and unpinned!', 'success');
          } else {
            console.warn("Unpinning failed");
            showStatus('Vault record deleted, but IPFS unpinning failed (manual cleanup needed).', 'info');
          }
        } catch (pinataErr) {
          console.error("Pinata unpin error:", pinataErr);
        }
      }

      await detectRole(account);
    } catch (e) {
      console.error(e);
      showStatus(`Delete failed: ${e.message}`, 'error');
    }
    setIsLoading(false);
  };

  const createVault = async () => {
    const targetBeneficiary = useManualAddr ? manualBenefAddr : predictedAddr;
    if (!file || !password || !targetBeneficiary || !timerDays) {
      showStatus('Fill in all fields and wait for address prediction.', 'error'); return;
    }
    if (useManualAddr && !ethers.isAddress(manualBenefAddr)) {
      showStatus('Invalid manual beneficiary address.', 'error'); return;
    }

    setIsLoading(true);
    try {
      // 1. Encrypt file
      showStatus('🔒 Encrypting file with AES-GCM 256…', 'info');
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      const encrypted = await encryptFile(fileBytes, password);
      const encBase64 = toBase64(encrypted);

      // 2. Upload to IPFS via Pinata
      showStatus('📡 Uploading encrypted blob to Pinata (IPFS)…', 'info');
      const blob = new Blob([encBase64], { type: 'text/plain' });
      const fileToUpload = new File([blob], `vault_${Date.now()}.enc`, { type: 'text/plain' });
      const form = new FormData();
      form.append('file', fileToUpload);

      const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_PINATA_JWT}`
        },
        body: form
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(`Pinata upload failed: ${errJson?.error?.details || res.statusText}`);
      }

      const json = await res.json();
      const cid = json?.IpfsHash;

      if (!cid) throw new Error("Pinata failed to return a CID (IpfsHash)");

      // 3. Wrap AES key
      showStatus('🔑 Wrapping encryption key…', 'info');
      const wrappedKey = await wrapKeyForStorage(password);

      // 4. Submit to blockchain
      showStatus('⛓ Submitting vault to blockchain…', 'info');
      const provider = await getProvider();
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const seconds = BigInt(Math.floor(parseFloat(timerDays) * 60));

      const tx = await contract.createVault(cid, wrappedKey, targetBeneficiary, seconds);

      showStatus('Transaction sent! Confirming…', 'info');
      await tx.wait();

      showStatus('✅ Vault created on Sepolia!', 'success');
      setRole(ROLE.OWNER);
      setVaultData({ ipfsCid: cid, encryptedKey: wrappedKey, beneficiary: targetBeneficiary, timePeriod: Number(seconds), lastCheckIn: Math.floor(Date.now() / 1000) });

      setTimeRemaining(Number(seconds));
    } catch (e) {
      console.error(e);
      showStatus('Transaction failed: ' + (e.reason || e.message), 'error');
    }
    setIsLoading(false);
  };

  // ── Claim Vault ───────────────────────────────────────────────────────
  const claimVault = async (ownerAddr) => {
    setIsLoading(true);
    showStatus('Claiming vault…', 'info');
    try {
      const provider = await getProvider();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      // If we're logged in via Google, we use a static call with the 'from' override
      // because we don't have a private key in MetaMask for the Smart Account.
      const [cid, key] = await contract.claimVault(ownerAddr, { from: account });

      setUnlockedVault({ cid, key });
      showStatus(`✅ Vault contents retrieved! Enter password to decrypt.`, 'success');

    } catch (e) { showStatus('Claim failed: ' + (e.reason || e.message), 'error'); }
    setIsLoading(false);
  };

  const handleDecrypt = async () => {
    if (!claimPassword || !unlockedVault) return;
    setIsLoading(true);
    showStatus('📥 Fetching from IPFS & Decrypting...', 'info');
    try {
      showStatus('📥 Fetching from IPFS...', 'info');
      // Use custom gateway if provided, otherwise fallback to ipfs.io
      const gateway = import.meta.env.VITE_PINATA_GATEWAY || 'https://ipfs.io';
      const res = await fetch(`${gateway}/ipfs/${unlockedVault.cid}`);
      if (!res.ok) throw new Error("IPFS fetch failed");

      const rawText = (await res.text()).trim();
      // Remove any quotes, whitespace or BOM
      const encBase64 = rawText.replace(/[^A-Za-z0-9+/=]/g, '');

      console.log('📦 Base64 Length:', encBase64.length);
      const encryptedBytes = fromBase64(encBase64);

      console.log('🔐 Encrypted Bytes Length:', encryptedBytes.length);

      // 2. Decrypt
      showStatus('🔐 Decrypting...', 'info');
      const decryptedBytes = await decryptFile(encryptedBytes, claimPassword);
      console.log('✅ Decryption successful!');



      // 3. Download
      const blob = new Blob([decryptedBytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `unlocked_secret_${unlockedVault.cid.slice(0, 6)}.bin`;
      a.click();

      showStatus('✅ File decrypted and downloaded!', 'success');
    } catch (e) {
      console.error(e);
      showStatus('Decryption failed. Check your password.', 'error');
    }
    setIsLoading(false);
  };


  // ── Status bar colours ────────────────────────────────────────────────
  const statusBg = { info: 'rgba(99,102,241,0.15)', success: 'rgba(16,185,129,0.12)', error: 'rgba(239,68,68,0.12)' };
  const statusColor = { info: '#a5b4fc', success: '#6ee7b7', error: '#fca5a5' };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0a0a1a; }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.4)} 50%{box-shadow:0 0 0 20px rgba(16,185,129,0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .card-anim { animation: fadeIn 0.4s ease; }
        input::placeholder { color: #475569; }
        input:focus { border-color: rgba(124,58,237,0.5) !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.1); }
        button:hover { opacity: 0.88; }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>

      <div style={S.root}>
        {/* Hero */}
        <div style={S.hero}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔐</div>
          <h1 style={S.heroTitle}>Dead Man's Vault</h1>
          <p style={S.heroSub}>Decentralized inheritance · AES-GCM 256 · ERC-4337 Account Abstraction</p>
        </div>

        {/* Header / Profile */}
        {account && (
          <div style={S.header} className="card-anim">
            <div style={S.profileBadge}>
              {googleUser?.picture ? (
                <img src={googleUser.picture} style={S.avatar} alt="Profile" />
              ) : (
                <span style={{ fontSize: '1.2rem' }}>🦊</span>
              )}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{googleUser?.name || 'Web3 User'}</span>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{googleUser ? googleUser.email : shortenAddr(account)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={disconnect}
                style={S.btnLogout}
                onMouseEnter={(e) => { e.target.style.background = 'rgba(239,68,68,0.1)'; }}
                onMouseLeave={(e) => { e.target.style.background = 'transparent'; }}
              >
                Logout 🚪
              </button>
            </div>
          </div>
        )}

        {/* Status */}
        {statusMsg && (
          <div style={{ ...S.status, background: statusBg[statusType], color: statusColor[statusType], maxWidth: '560px', width: '100%' }}>
            {statusMsg}
          </div>
        )}

        {/* Debug Address (Only for development) */}
        {account && (
          <div style={{ fontSize: '0.65rem', color: '#475569', marginBottom: '10px', fontFamily: 'monospace' }}>
            Current Identity: {account}
          </div>
        )}

        {/* ── NOT CONNECTED ── */}
        {!account && (
          <div style={{ ...S.card, textAlign: 'center' }} className="card-anim">
            <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🔑</div>
            <h2 style={{ ...S.cardTitle, textAlign: 'center' }}>Secure Access</h2>
            <p style={{ color: '#64748b', marginBottom: '28px', fontSize: '0.9rem' }}>Choose your authentication method. Your Smart Account is created instantly.</p>

            <button id="btn-google-login" onClick={loginWithGoogle} disabled={isLoading} style={{ ...S.btnGoogle, background: '#fff', color: '#1f2937', marginBottom: '12px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
              {isLoading ? 'Processing…' : 'Continue with Google'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0', color: '#475569' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
              <span style={{ fontSize: '0.8rem' }}>OR</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
            </div>

            <button id="btn-connect-wallet" onClick={connect} disabled={isLoading} style={S.btnGoogle}>
              🦊 {isLoading ? 'Connecting…' : 'Connect MetaMask Wallet'}
            </button>
          </div>
        )}

        {/* ── LOADING ROLE ── */}
        {account && role === ROLE.LOADING && (
          <div style={{ ...S.card, textAlign: 'center' }} className="card-anim">
            <div style={{ fontSize: '2rem', animation: 'spin 1s linear infinite', display: 'inline-block', marginBottom: '16px' }}>⚙️</div>
            <p style={{ color: '#94a3b8' }}>Checking your role on-chain…</p>
          </div>
        )}

        {/* ── OWNER VIEW ── */}
        {account && role === ROLE.OWNER && vaultData && (
          <div style={S.card} className="card-anim">
            <span style={{ ...S.badge, background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>● OWNER</span>
            <h2 style={S.cardTitle}>Your Vault is Active</h2>
            <div style={S.pulse}>💓</div>
            {timeRemaining !== null && (
              <div style={S.timerText}>{secsToDuration(timeRemaining)} remaining</div>
            )}
            <p style={{ color: '#64748b', textAlign: 'center', fontSize: '0.85rem', marginBottom: '20px' }}>Click below to reset the timer and prove you're alive.</p>
            <button id="btn-checkin" onClick={checkIn} disabled={isLoading} style={S.btnGreen}>
              {isLoading ? 'Processing…' : '💓 I Am Alive — Check In'}
            </button>
            <hr style={S.divider} />
            <span style={S.label}>Beneficiary (counterfactual address)</span>
            <div style={S.addressBox}>{vaultData.beneficiary}</div>
            <span style={S.label}>IPFS CID</span>
            <div style={S.addressBox}>{vaultData.ipfsCid}</div>

            {/* Reset Option */}
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <button
                onClick={deleteVault}
                disabled={isLoading}
                style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '8px 20px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
              >
                {isLoading ? 'Processing...' : '🗑️ Destroy Vault & Start Over'}
              </button>
            </div>
          </div>
        )}

        {/* ── BENEFICIARY VIEW ── */}
        {account && role === ROLE.BENEFICIARY && (
          <div style={S.card} className="card-anim">
            <span style={{ ...S.badge, background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>● BENEFICIARY</span>
            <h2 style={S.cardTitle}>Vaults Left For You</h2>
            {benefVaults.map((ownerAddr) => (
              <div key={ownerAddr} style={S.vaultRow}>
                <span style={S.label}>Owner</span>
                <div style={{ color: '#c4b5fd', fontSize: '0.82rem', marginBottom: '12px' }}>{ownerAddr}</div>
                <button id={`btn-claim-${ownerAddr}`} onClick={() => claimVault(ownerAddr)} disabled={isLoading} style={S.btnAmber}>
                  {isLoading ? 'Claiming…' : '🔓 Claim Vault'}
                </button>
              </div>
            ))}

            {/* Decryption Panel */}
            {unlockedVault && (
              <div style={{ ...S.vaultRow, border: '1px solid #10b981', background: 'rgba(16,185,129,0.05)', marginTop: '20px' }}>
                <span style={{ ...S.label, color: '#10b981' }}>🔓 VAULT UNLOCKED</span>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '12px' }}>Contents retrieved from IPFS. Enter the vault password to view the secret document.</p>
                <input
                  type="password"
                  placeholder="Enter vault password..."
                  value={claimPassword}
                  onChange={e => setClaimPassword(e.target.value)}
                  style={S.input}
                />
                <button onClick={handleDecrypt} disabled={isLoading} style={S.btnGreen}>
                  {isLoading ? 'Processing...' : 'Decrypt & Download Secret'}
                </button>
              </div>
            )}
          </div>

        )}

        {/* ── NEW USER — CREATE VAULT ── */}
        {account && role === ROLE.NEW && (
          <div style={S.card} className="card-anim">
            <span style={{ ...S.badge, background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>● NEW USER</span>
            <h2 style={S.cardTitle}>Create Your Vault</h2>

            {/* Connected wallet */}
            <span style={S.label}>Your Wallet</span>
            <div style={S.addressBox}>{account}</div>

            {/* File upload */}
            <span style={S.label}>Secret Document (Will, instructions, keys…)</span>
            <input id="input-file" type="file" onChange={e => setFile(e.target.files[0])} style={{ ...S.input, padding: '10px' }} />

            {/* Password */}
            <span style={S.label}>Vault Password (AES-GCM 256 encryption)</span>
            <input id="input-password" type="password" placeholder="Strong password…" value={password} onChange={e => setPassword(e.target.value)} style={S.input} />

            {/* Beneficiary Selection */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={S.label}>Beneficiary</span>
              <button
                onClick={() => setUseManual(!useManualAddr)}
                style={{ background: 'transparent', border: 'none', color: '#818cf8', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {useManualAddr ? 'Use Email Prediction' : 'Use Manual Address'}
              </button>
            </div>

            {!useManualAddr ? (
              <>
                <input id="input-email" type="email" placeholder="beneficiary@email.com" value={benefEmail} onChange={e => setBenefEmail(e.target.value)} style={S.input} />
                {isPredicting && <p style={{ color: '#94a3b8', fontSize: '0.82rem', marginBottom: '10px' }}>⚙️ Computing CREATE2 address…</p>}
                {predictedAddr && !isPredicting && (
                  <>
                    <span style={S.label}>✅ Predicted Smart Account (CREATE2)</span>
                    <div style={S.predictBox}>{predictedAddr}</div>
                  </>
                )}
              </>
            ) : (
              <>
                <input
                  id="input-manual-addr"
                  type="text"
                  placeholder="0x..."
                  value={manualBenefAddr}
                  onChange={e => setManualBenef(e.target.value)}
                  style={S.input}
                />
                <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '14px' }}>
                  Paste one of your other MetaMask addresses (e.g. Account 2).
                </p>
              </>
            )}


            {/* Timer */}
            <span style={S.label}>Dead Man's Timer (minutes of inactivity)</span>
            <input id="input-timer" type="number" min="1" placeholder="e.g. 5" value={timerDays} onChange={e => setTimerDays(e.target.value)} style={S.input} />


            <button id="btn-create-vault" onClick={createVault} disabled={isLoading || (!useManualAddr && !predictedAddr) || (useManualAddr && !manualBenefAddr)} style={S.btnPrimary}>

              {isLoading ? 'Processing…' : '⛓ Create Vault on Blockchain'}
            </button>
          </div>
        )}

        {/* Footer */}
        <p style={{ color: '#1e293b', fontSize: '0.75rem', marginTop: '32px' }}>
          Dead Man's Vault · Sepolia Testnet · ERC-4337 · AES-GCM 256
        </p>
      </div>
    </>
  );
}