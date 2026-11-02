# Dead Man's Switch

Dead Man's Switch is a React demo for creating a timed digital vault. It encrypts a selected file in the browser with a random AES-GCM data key, wraps that key with the user's password, stores the encrypted blob on IPFS through Pinata, and records the IPFS content ID, wrapped key, beneficiary, and check-in timer in a Sepolia smart contract. The owner can check in, update, or delete a vault; a beneficiary can use the contract's claim view after the timer expires.

## Stack

- React 18 and Vite
- ethers.js and MetaMask SDK for wallet and Sepolia contract interactions
- Browser AES-GCM encryption
- Pinata for IPFS storage, accessed through a local Vite development middleware
- Solidity smart contract deployed on Sepolia
- Counterfactual account address derivation prototype; full ERC-4337 UserOperation flow planned for v2

## Run locally

1. Install Node.js (18 or newer) and npm.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in the values:

   ```dotenv
   PINATA_JWT=your_new_pinata_jwt
   VITE_PINATA_GATEWAY=https://gateway.pinata.cloud
   VITE_GOOGLE_CLIENT_ID=
   ```

   `PINATA_JWT` is read only by the local Vite server middleware. Keep it in the ignored `.env` file; do not add a `VITE_` prefix. The Vite development server uses it to proxy upload and unpin requests, so the Pinata credential is not sent to the browser. If the old JWT has ever been used in a public build, revoke it in Pinata and replace it with a new token.

4. Install and unlock MetaMask, switch it to Sepolia, and make sure the connected account has Sepolia ETH for transactions. Google Client ID is optional; without it, sign-in falls back to a prompted demo email. Google sign-in only maps an email to a predicted address; it does not submit transactions. Use MetaMask for state-changing calls.
5. Start the development server:

   ```sh
   npm run dev
   ```

Open the local URL printed by Vite. `npm run build` creates static files; it does not include the local Pinata middleware.

## Limitations

- This is a demo, not a production digital-legacy service. Do not use it for irreplaceable files or funds.
- The contract's `vaults` mapping is public. Anyone can read the CID and password-wrapped data key at any time; the timer is a coordination mechanism, not a cryptographic access lock. The file stays encrypted on IPFS, but the password can be attacked offline if it is weak.
- The app UI requires a password of at least 12 characters for new vaults, but the contract does not enforce this. The password protects the random AES data key; losing it makes the file unrecoverable, and a weak password can be guessed offline.
- Pinata upload and unpin work only through the local Vite development server. A deployed app needs a serverless function or other server-side API to hold `PINATA_JWT` and proxy these operations.
- The smart contract address is hard-coded and targets Sepolia. The app depends on the contract and test network being available; Sepolia assets have no mainnet value.
- Google sign-in is a demo identity/address-mapping flow, not authentication for contract transactions. The fallback email prompt is not identity verification.
- Every state-changing transaction currently uses MetaMask directly. The prototype derives an account-abstraction address, but has no UserOperation, bundler, or paymaster flow; full ERC-4337 support is planned for v2.
- The timer is configured in minutes in the UI and stored as seconds by the contract. Timer behavior depends on Sepolia transactions and block timestamps.
- Existing vaults created before the random-data-key format continue to decrypt using their legacy password-based file format.

Run locally; the Pinata key must not be deployed in a public build.

## Screenshots

landing page 

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/cb344585-fd8c-4337-8cc3-02199a278a71" />

vault with timer

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/7a138c3e-f261-472f-be09-5b97df1b8306" />

Beneficiary login

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/cbb7e61c-da58-4383-9e1a-a5789fe301ba" />
