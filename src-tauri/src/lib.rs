use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[derive(serde::Serialize)]
struct FileInfo {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
async fn list_files(app: tauri::AppHandle, folder_name: &str) -> Result<Vec<FileInfo>, String> {
    let mut hub_path = app.path().picture_dir().map_err(|e| e.to_string())?;
    hub_path.push("IMAGE_HUB");
    hub_path.push(folder_name);

    if !hub_path.exists() {
        fs::create_dir_all(&hub_path).map_err(|e| e.to_string())?;
    }

    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(hub_path) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                files.push(FileInfo {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: entry.path().to_string_lossy().to_string(),
                    is_dir: metadata.is_dir(),
                });
            }
        }
    }
    Ok(files)
}

#[tauri::command]
async fn open_folder(app: tauri::AppHandle, folder_name: &str) -> Result<(), String> {
    let mut hub_path = app.path().picture_dir().map_err(|e| e.to_string())?;
    hub_path.push("IMAGE_HUB");
    hub_path.push(folder_name);
    let _ = opener::reveal(&hub_path);
    Ok(())
}

#[tauri::command]
async fn process_dropped_files(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    let mut dest_dir = app.path().picture_dir().map_err(|e| e.to_string())?;
    dest_dir.push("IMAGE_HUB");
    dest_dir.push("00_DEPOT_IMAGE");

    if !dest_dir.exists() {
        fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    }

    for path_str in paths {
        let src_path = Path::new(&path_str);
        if src_path.is_file() {
            if let Some(file_name) = src_path.file_name() {
                let dest_path = dest_dir.join(file_name);
                fs::copy(src_path, dest_path).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

// --- LOGIQUE DE TRAITEMENT ---

#[tauri::command]
async fn run_logo_manager(app: tauri::AppHandle) -> Result<String, String> {
    let pic_dir = app.path().picture_dir().map_err(|e| e.to_string())?;
    let hub_root = pic_dir.join("IMAGE_HUB");
    let input_dir = hub_root.join("00_DEPOT_IMAGE");
    let output_base = hub_root.join("01_LOGOS_FINAUX");
    
    let png_dir = output_base.join("png");
    let svg_dir = output_base.join("svg");
    let jpeg_dir = output_base.join("jpeg");

    fs::create_dir_all(&png_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&svg_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&jpeg_dir).map_err(|e| e.to_string())?;

    let mut count = 0;
    
    // Initialiser la DB de polices pour usvg
    let font_db = usvg::fontdb::Database::new();

    if let Ok(entries) = fs::read_dir(&input_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() { continue; }

            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            let file_name = path.file_name().unwrap().to_string_lossy();

            match ext.as_str() {
                "svg" => {
                    let opt = usvg::Options::default();
                    let svg_data = fs::read(&path).map_err(|e| e.to_string())?;
                    let tree = usvg::Tree::from_data(&svg_data, &opt, &font_db).map_err(|e| e.to_string())?;
                    
                    let pixmap_size = tree.size().to_int_size().scale_by(4.0).unwrap();
                    let mut pixmap = tiny_skia::Pixmap::new(pixmap_size.width(), pixmap_size.height()).unwrap();
                    
                    let render_ts = tiny_skia::Transform::from_scale(4.0, 4.0);
                    resvg::render(&tree, render_ts, &mut pixmap.as_mut());
                    
                    let output_path = png_dir.join(format!("{}.png", path.file_stem().unwrap().to_string_lossy()));
                    pixmap.save_png(output_path).map_err(|e| e.to_string())?;
                    
                    fs::rename(&path, svg_dir.join(&*file_name)).map_err(|e| e.to_string())?;
                    count += 1;
                },
                "png" => {
                    fs::rename(&path, png_dir.join(&*file_name)).map_err(|e| e.to_string())?;
                    count += 1;
                },
                "jpg" | "jpeg" => {
                    fs::rename(&path, jpeg_dir.join(&*file_name)).map_err(|e| e.to_string())?;
                    count += 1;
                },
                _ => {}
            }
        }
    }

    Ok(format!("{} fichiers traites avec succes", count))
}

#[tauri::command]
async fn run_ai_task(app: tauri::AppHandle, task_type: &str) -> Result<String, String> {
    let pic_dir = app.path().picture_dir().map_err(|e| e.to_string())?;
    let hub_root = pic_dir.join("IMAGE_HUB");
    let input_dir = hub_root.join("00_DEPOT_IMAGE");
    
    let mut script_path = PathBuf::from(r"C:\Users\momoz\Documents\Projects\SCRIPTS");
    let output_dir;

    match task_type {
        "upscale" => {
            script_path.push("Upscale");
            script_path.push("main.py");
            output_dir = hub_root.join("02_IMAGES_AGRANDIES");
        },
        "remove_bg" => {
            script_path.push("Remove BG");
            script_path.push("remove_background.py");
            output_dir = hub_root.join("03_IMAGES_DETOUREES");
        },
        _ => return Err("Tache inconnue".to_string()),
    }

    let output = app.shell()
        .command("python")
        .args([
            script_path.to_str().unwrap(),
            input_dir.to_str().unwrap(),
            output_dir.to_str().unwrap()
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(format!("Tache {} terminee", task_type))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_files, 
            open_folder, 
            process_dropped_files,
            run_logo_manager,
            run_ai_task
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
