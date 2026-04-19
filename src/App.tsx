import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import logoWhite from "./assets/logo_white.png";

interface FileInfo {
  name: string;
  path: string;
  is_dir: boolean;
}

const IconFolder = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>;
const IconAction = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>;

function App() {
  const [currentFolder, setCurrentFolder] = useState("00_DEPOT_IMAGE");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const folders = [
    { id: "00_DEPOT_IMAGE", label: "DEPOT" },
    { id: "01_LOGOS_FINAUX", label: "LOGOS" },
    { id: "02_IMAGES_AGRANDIES", label: "UPSCALE" },
    { id: "03_IMAGES_DETOUREES", label: "DETOURAGE" },
    { id: "04_OPTIMISATION_AVIF", label: "AVIF" },
    { id: "05_ICONES_WINDOWS", label: "ICONES" },
  ];

  const refreshFiles = async () => {
    setLoading(true);
    try {
      const result: FileInfo[] = await invoke("list_files", { folderName: currentFolder });
      setFiles(result.filter(f => !f.is_dir));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleOpenFolder = async () => { await invoke("open_folder", { folderName: currentFolder }); };

  const runTask = async (task: string) => {
    setProcessing(task.toUpperCase().replace(/_/g, ' ') + " EN COURS");
    try {
      if (task === 'logos') await invoke("run_logo_manager");
      else await invoke("run_ai_task", { taskType: task });
      refreshFiles();
    } catch (err) { console.error(err); }
    finally { setProcessing(null); }
  };

  useEffect(() => { refreshFiles(); }, [currentFolder]);

  useEffect(() => {
    const setup = async () => {
      await listen("tauri://drag-over", () => setIsDragging(true));
      await listen("tauri://drag-leave", () => setIsDragging(false));
      await listen<{ paths: string[] }>("tauri://drag-drop", async (event) => {
        setIsDragging(false);
        await invoke("process_dropped_files", { paths: event.payload.paths });
        setCurrentFolder("00_DEPOT_IMAGE");
        refreshFiles();
      });
    };
    setup();
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#020617] text-slate-200">
      
      {/* Sidebar Glass */}
      <aside className="w-72 h-full flex flex-col border-r border-white/5 bg-slate-900/40 backdrop-blur-xl z-20">
        <div className="p-10 flex flex-col items-center">
          <div className="relative group mb-4">
            <div className="absolute -inset-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full blur opacity-20"></div>
            <img src={logoWhite} className="relative h-12 w-auto" alt="Logo" />
          </div>
          <h1 className="text-[10px] font-black tracking-[0.5em] text-white/40 uppercase">Image Hub Core</h1>
        </div>

        <nav className="flex-1 px-6 space-y-1">
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => setCurrentFolder(f.id)}
              className={`w-full flex items-center px-4 py-3 text-[10px] font-bold tracking-widest rounded-xl transition-all ${
                currentFolder === f.id
                  ? "bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.1)]"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}
            >
              <div className={`mr-4 ${currentFolder === f.id ? "text-blue-500" : "opacity-20"}`}>
                <IconFolder />
              </div>
              {f.label}
            </button>
          ))}
        </nav>

        <div className="p-6 space-y-2 border-t border-white/5 bg-black/20">
          <p className="text-[9px] font-bold text-slate-600 tracking-widest uppercase mb-4 ml-2">Engine Commands</p>
          {[
            { id: 'logos', label: 'Procéder Logos', color: 'border-purple-500/30 text-purple-400 hover:bg-purple-500/10' },
            { id: 'upscale', label: 'Upscale IA 4X', color: 'border-green-500/30 text-green-400 hover:bg-green-500/10' },
            { id: 'remove_bg', label: 'Détourage Auto', color: 'border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10' }
          ].map(task => (
            <button 
              key={task.id}
              onClick={() => runTask(task.id)}
              className={`flex items-center justify-between w-full p-3 rounded-xl bg-white/5 border ${task.color} transition-all active:scale-95`}
            >
              <span className="text-[9px] font-black uppercase tracking-tighter">{task.label}</span>
              <IconAction />
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        <header className="h-24 flex items-center justify-between px-12 border-b border-white/5 bg-slate-900/20 backdrop-blur-md">
          <div>
            <h2 className="text-xl font-black tracking-tight text-white uppercase italic">{currentFolder.replace(/_/g, ' ')}</h2>
            <div className="flex items-center space-x-2 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]"></div>
              <span className="text-[9px] text-slate-500 font-bold tracking-widest uppercase">System Connected</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <button onClick={refreshFiles} className="p-3 bg-white/5 rounded-full border border-white/5 text-slate-400 hover:text-white transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.001 0 01-15.357-2m15.357 2H15" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
            <button onClick={handleOpenFolder} className="px-8 py-3 bg-white text-black text-[10px] font-black rounded-full hover:bg-blue-600 hover:text-white transition-all shadow-xl shadow-white/10 uppercase tracking-widest">
              Explorer
            </button>
          </div>
        </header>

        {/* Gallery */}
        <section className="flex-1 overflow-y-auto p-12 custom-scrollbar">
          {loading ? (
             <div className="h-full flex items-center justify-center text-[10px] font-black tracking-[0.5em] text-slate-700 animate-pulse">Syncing...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
              {files.map((file, i) => (
                <div key={i} className="group relative aspect-square bg-white/5 rounded-2xl border border-white/5 p-6 hover:border-blue-500/30 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl">
                  <div className="w-full h-full bg-black/20 rounded-xl border border-white/5 flex items-center justify-center group-hover:border-blue-500/20">
                    <span className="text-[8px] font-black text-slate-800 uppercase tracking-widest group-hover:text-blue-500/30">Object Vault</span>
                  </div>
                  <div className="absolute bottom-6 left-6 right-6">
                    <p className="text-[9px] font-bold text-slate-500 truncate uppercase tracking-widest group-hover:text-white">{file.name}</p>
                  </div>
                  <span className="absolute top-4 right-4 text-[7px] font-black px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                    {file.name.split('.').pop()}
                  </span>
                </div>
              ))}
              {files.length === 0 && (
                <div className="col-span-full py-40 flex flex-col items-center justify-center opacity-10">
                  <p className="text-[10px] font-black uppercase tracking-[1em]">Vault Empty</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-8 z-50 bg-blue-600/10 backdrop-blur-xl rounded-[40px] border-2 border-dashed border-blue-500 flex flex-col items-center justify-center animate-in zoom-in duration-300">
             <h2 className="text-2xl font-black text-blue-500 uppercase tracking-widest italic">Drop to Import</h2>
          </div>
        )}

        <footer className="h-12 border-t border-white/5 px-12 flex items-center justify-between text-[8px] text-slate-700 font-bold uppercase tracking-widest">
          <span>Image Hub Native Engine // Rev 2.2</span>
          <span>Redious // High Performance Cluster</span>
        </footer>
      </main>

      {/* Processing State */}
      {processing && (
        <div className="fixed inset-0 z-[200] bg-[#020617]/98 backdrop-blur-3xl flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-2 border-blue-500/10 border-t-blue-500 rounded-full animate-spin"></div>
          <h2 className="mt-8 text-[10px] font-black tracking-[0.8em] text-white uppercase animate-pulse">{processing}</h2>
        </div>
      )}
    </div>
  );
}

export default App;
