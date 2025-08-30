import { useMemo } from 'react';
import './App.css';
import { downloads, getDownloadUrl } from './data/downloads';

function isPrerelease(v: string){ return /-/.test(v); }
function semverKey(v: string){ return v.split(/\.|-/).map(p=>parseInt(p.replace(/[^0-9]/g,''))||0); }
function semverCompare(a: string, b: string){
  const pa=semverKey(a), pb=semverKey(b);
  for(let i=0;i<Math.max(pa.length,pb.length);i++){ const d=(pa[i]||0)-(pb[i]||0); if(d) return d; }
  return 0;
}

export default function App(){
  const sorted = useMemo(()=> {
    return [...downloads].sort((a,b)=> {
      const diff = semverCompare(b.version, a.version); if(diff) return diff;
      return a.file.localeCompare(b.file);
    });
  }, []);

  const latestVersion = useMemo(()=> {
    const stable = sorted.filter(d=>!isPrerelease(d.version));
    const pool = stable.length ? stable : sorted;
    return pool.length ? pool[0].version : null;
  }, [sorted]);

  return (
    <>
      <header className="site-header"><div className="inner">
        <h1 className="logo">Birthday Messenger</h1>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#downloads">Downloads</a>
          <a href="https://github.com/Jay-Karia/birthday-messenger" target="_blank" rel="noopener">Source</a>
        </nav>
      </div></header>
      <main>
        <section className="hero">
          <h1>Download</h1>
          <p>Get the Windows installer for Birthday Messenger. The app helps you automatically send WhatsApp messages and emails on birthdays.</p>
          <p className="tagline">Latest version: {latestVersion || 'N/A'}</p>
        </section>

        <section id="downloads" className="downloads">
          <h2>Windows Installers</h2>
          {!sorted.length && <p>No entries configured. Edit <code>src/data/downloads.ts</code>.</p>}
          {!!sorted.length && (
            <table className="downloads-table" aria-describedby="downloadsHelp">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Version</th>
                  <th>Arch</th>
                  <th>Channel</th>
                  <th>Download</th>
                  <th>SHA256</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(d => {
                  const channel = d.channel || (isPrerelease(d.version) ? 'preview' : 'stable');
                  return (
                    <tr key={d.file}>
                      <td data-label="File"><code>{d.file}</code></td>
                      <td data-label="Version">{d.version}</td>
                      <td data-label="Arch">{d.arch}</td>
                      <td data-label="Channel">
                        <span className={"badge" + (channel === 'preview' ? ' preview' : '')}>{channel === 'preview' ? 'Preview' : 'Stable'}</span>
                      </td>
                      <td data-label="Download"><a href={getDownloadUrl(d)} download>Download</a></td>
                      <td data-label="SHA256">{d.sha256 ? <code>{d.sha256.slice(0,12)}…</code> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p id="downloadsHelp" className="version-summary notice">Installer list is manually maintained in <code>src/data/downloads.ts</code>. Update and redeploy after releasing a new version.</p>
        </section>

        <section>
          <h2>Verification</h2>
          <p>After download you can verify integrity using PowerShell:</p>
          <pre><code>Get-FileHash .\\birthday-messenger-0.0.4.Setup.exe -Algorithm SHA256</code></pre>
        </section>
      </main>
      <footer className="site-footer">&copy; {new Date().getFullYear()} Birthday Messenger. MIT License.</footer>
    </>
  );
}
