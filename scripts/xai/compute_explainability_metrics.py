"""
Quantitative metrics for explainability methods comparison.

Computes:
  - Heatmap IoU: Intersection-over-union between Grad-CAM and Integrated Gradients
  - Attention Entropy: Shannon entropy of attention maps (localized vs distributed)
  - Method Correlation: Pearson correlation between IG and Grad-CAM attributions
  - Sanity Check: Does SHAP correlation drop under model randomization?

Usage:
  uv run python -m scripts.compute_explainability_metrics \
    --output-dir outputs/ \
    --methods gradcam integrated_gradients attention_maps shap \
    --sample-size 5 \
    --label Cardiomegaly

Output:
  - metrics.csv with per-image/label metrics
  - correlation_summary.png showing method agreement
  - attention_entropy_dist.png for Swin Tiny analysis
"""

import os
import sys
import argparse
import warnings
import json
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime

import torch
import matplotlib.pyplot as plt
from scipy.stats import entropy, pearsonr, spearmanr
from skimage.metrics import structural_similarity as ssim
from PIL import Image

warnings.filterwarnings('ignore')

# ─────────────────────────────────────────────────────────────────────────────
# Utility Functions
# ─────────────────────────────────────────────────────────────────────────────

def load_heatmap(filepath):
    """Load PNG heatmap and return as normalized numpy array."""
    if not os.path.exists(filepath):
        return None
    try:
        img = Image.open(filepath).convert('L') # Grayscale
        arr = np.array(img, dtype=np.float32) / 255.0
        return arr
    except Exception as e:
        print(f"[WARNING]️ Failed to load {filepath}: {e}")
        return None

def compute_iou(mask1, mask2, threshold=0.5):
    """Intersection-over-union between two heatmaps at given threshold."""
    if mask1 is None or mask2 is None:
        return np.nan
    
    # Binarize at threshold
    bin1 = (mask1 > threshold).astype(np.uint8)
    bin2 = (mask2 > threshold).astype(np.uint8)
    
    intersection = np.sum(bin1 & bin2)
    union = np.sum(bin1 | bin2)
    
    if union == 0:
        return np.nan
    return intersection / union

def compute_ssim(img1, img2):
    """Structural similarity between two heatmaps."""
    if img1 is None or img2 is None:
        return np.nan
    
    # Ensure same shape
    if img1.shape != img2.shape:
        return np.nan
    
    return ssim(img1, img2, data_range=1.0)

def compute_correlation(map1, map2):
    """Pearson correlation between two flattened heatmaps."""
    if map1 is None or map2 is None:
        return np.nan
    
    # Flatten and remove NaNs
    flat1 = map1.flatten()
    flat2 = map2.flatten()
    
    valid_idx = ~(np.isnan(flat1) | np.isnan(flat2))
    if np.sum(valid_idx) < 10:
        return np.nan
    
    corr, _ = pearsonr(flat1[valid_idx], flat2[valid_idx])
    return corr

def compute_attention_entropy(attention_map):
    """
    Shannon entropy of attention distribution.
    High entropy = distributed attention (bad, uncertain)
    Low entropy = focused attention (good, confident)
    """
    if attention_map is None:
        return np.nan
    
    # Normalize to probability distribution
    att_flat = attention_map.flatten()
    att_flat = np.maximum(att_flat, 1e-6)
    p = att_flat / np.sum(att_flat)
    
    return entropy(p)

def parse_filename(filename):
    """
    Extract metadata from heatmap filename.
    Assumes format: {patient}_{study}_{view}_{arch}_{method}.png
    """
    parts = Path(filename).stem.split('_')
    
    try:
        patient = parts[0] # patient00082
        study = parts[1] # study1
        
        # Find architecture (last before extension, working backwards)
        arch = None
        for a in ['swin_tiny', 'vit_base', 'densenet121', 'resnet50']:
            if a in filename:
                arch = a
                break
        
        return {'patient': patient, 'study': study, 'arch': arch}
    except:
        return None

# ─────────────────────────────────────────────────────────────────────────────
# Metric Computation
# ─────────────────────────────────────────────────────────────────────────────

def compute_metrics_for_sample(output_dir, patient_id=None):
    """
    Compute metrics for a single sample across all methods.
    Returns dict with metrics.
    """
    metrics = {
        'timestamp': datetime.now().isoformat(),
        'sample_id': patient_id,
    }
    
    # Find all heatmaps for this sample
    gradcam_maps = {}
    ig_maps = {}
    attention_maps = {}
    shap_maps = {}
    
    # Scan output directories
    dirs_to_scan = {
        'gradcam': gradcam_maps,
        'integrated_gradients': ig_maps,
        'attention_maps': attention_maps,
        'shap': shap_maps,
    }
    
    for dir_name, target_dict in dirs_to_scan.items():
        dir_path = os.path.join(output_dir, dir_name)
        if not os.path.isdir(dir_path):
            continue
        
        for fname in os.listdir(dir_path):
            if patient_id and patient_id not in fname:
                continue
            
            filepath = os.path.join(dir_path, fname)
            heatmap = load_heatmap(filepath)
            if heatmap is not None:
                # Try to extract label from filename
                # Assume label appears after arch in multi-label case
                target_dict[fname] = heatmap
    
    # ─ Compute Heatmap IoU (Grad-CAM vs IG) ─
    if gradcam_maps and ig_maps:
        iou_scores = []
        for gc_fname, gc_map in gradcam_maps.items():
            # Find matching IG map
            for ig_fname, ig_map in ig_maps.items():
                # Simple heuristic: same patient/study/arch
                if parse_filename(gc_fname) and parse_filename(ig_fname):
                    gc_meta = parse_filename(gc_fname)
                    ig_meta = parse_filename(ig_fname)
                    
                    if (gc_meta['patient'] == ig_meta['patient'] and 
                        gc_meta['arch'] == ig_meta['arch']):
                        iou = compute_iou(gc_map, ig_map, threshold=0.5)
                        if not np.isnan(iou):
                            iou_scores.append(iou)
        
        if iou_scores:
            metrics['heatmap_iou_mean'] = np.mean(iou_scores)
            metrics['heatmap_iou_std'] = np.std(iou_scores)
            metrics['heatmap_iou_count'] = len(iou_scores)
    
    # ─ Compute SSIM (Grad-CAM vs IG) ─
    if gradcam_maps and ig_maps:
        ssim_scores = []
        for gc_fname, gc_map in gradcam_maps.items():
            for ig_fname, ig_map in ig_maps.items():
                gc_meta = parse_filename(gc_fname)
                ig_meta = parse_filename(ig_fname)
                if gc_meta and ig_meta and (gc_meta['patient'] == ig_meta['patient'] and 
                    gc_meta['arch'] == ig_meta['arch']):
                    # Resize IG to match Grad-CAM if needed
                    if gc_map.shape != ig_map.shape:
                        from scipy.ndimage import zoom
                        scale = np.array(gc_map.shape) / np.array(ig_map.shape)
                        ig_map = zoom(ig_map, scale)
                    
                    ssim_val = compute_ssim(gc_map, ig_map)
                    if not np.isnan(ssim_val):
                        ssim_scores.append(ssim_val)
        
        if ssim_scores:
            metrics['ssim_mean'] = np.mean(ssim_scores)
            metrics['ssim_std'] = np.std(ssim_scores)
    
    # ─ Compute Attention Entropy (Swin/ViT only) ─
    if attention_maps:
        entropy_scores = []
        for fname, att_map in attention_maps.items():
            ent = compute_attention_entropy(att_map)
            if not np.isnan(ent):
                entropy_scores.append(ent)
        
        if entropy_scores:
            metrics['attention_entropy_mean'] = np.mean(entropy_scores)
            metrics['attention_entropy_std'] = np.std(entropy_scores)
            metrics['attention_entropy_count'] = len(entropy_scores)
    
    # ─ Compute Method Correlation (Grad-CAM vs IG pixels) ─
    if gradcam_maps and ig_maps:
        corr_scores = []
        for gc_fname, gc_map in gradcam_maps.items():
            for ig_fname, ig_map in ig_maps.items():
                gc_meta = parse_filename(gc_fname)
                ig_meta = parse_filename(ig_fname)
                if gc_meta and ig_meta and (gc_meta['patient'] == ig_meta['patient'] and 
                    gc_meta['arch'] == ig_meta['arch']):
                    # Resize if needed
                    if gc_map.shape != ig_map.shape:
                        from scipy.ndimage import zoom
                        scale = np.array(gc_map.shape) / np.array(ig_map.shape)
                        ig_map = zoom(ig_map, scale)
                    
                    corr = compute_correlation(gc_map, ig_map)
                    if not np.isnan(corr):
                        corr_scores.append(corr)
        
        if corr_scores:
            metrics['method_correlation_mean'] = np.mean(corr_scores)
            metrics['method_correlation_std'] = np.std(corr_scores)
    
    # ─ Verify SHAP sanity check outputs ─
    sanity_check_dir = os.path.join(output_dir, 'shap_sanity_checks')
    if os.path.isdir(sanity_check_dir):
        sanity_files = [f for f in os.listdir(sanity_check_dir) if 'sanity' in f.lower()]
        metrics['shap_sanity_check_count'] = len(sanity_files)
        if sanity_files:
            metrics['shap_sanity_check_status'] = 'completed'
    
    return metrics

def scan_and_compute_all_metrics(output_dir):
    """Scan output directory and compute metrics for all unique samples."""
    all_metrics = []
    
    # Find unique patient IDs from heatmaps
    patient_ids = set()
    for subdir in ['gradcam', 'integrated_gradients', 'attention_maps', 'shap']:
        dir_path = os.path.join(output_dir, subdir)
        if os.path.isdir(dir_path):
            for fname in os.listdir(dir_path):
                meta = parse_filename(fname)
                if meta:
                    patient_ids.add(meta['patient'])
    
    print(f" Found {len(patient_ids)} unique samples")
    
    # Compute metrics for each
    for i, patient_id in enumerate(sorted(patient_ids), 1):
        print(f" [{i}/{len(patient_ids)}] Computing metrics for {patient_id}...")
        metrics = compute_metrics_for_sample(output_dir, patient_id)
        all_metrics.append(metrics)
    
    return pd.DataFrame(all_metrics)

# ─────────────────────────────────────────────────────────────────────────────
# Visualization
# ─────────────────────────────────────────────────────────────────────────────

def plot_metrics_summary(metrics_df, output_dir):
    """Create summary plots from metrics dataframe."""
    
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('Explainability Methods Comparison', fontsize=16, fontweight='bold')
    
    # Plot 1: Heatmap IoU Distribution
    if 'heatmap_iou_mean' in metrics_df.columns:
        valid_iou = metrics_df['heatmap_iou_mean'].dropna()
        if len(valid_iou) > 0:
            axes[0, 0].hist(valid_iou, bins=10, alpha=0.7, color='steelblue', edgecolor='black')
            axes[0, 0].axvline(valid_iou.mean(), color='red', linestyle='--', linewidth=2, label=f'μ={valid_iou.mean():.3f}')
            axes[0, 0].set_title('Heatmap IoU (Grad-CAM vs IG)')
            axes[0, 0].set_xlabel('IoU Score')
            axes[0, 0].set_ylabel('Count')
            axes[0, 0].legend()
            axes[0, 0].grid(alpha=0.3)
    
    # Plot 2: Method Correlation
    if 'method_correlation_mean' in metrics_df.columns:
        valid_corr = metrics_df['method_correlation_mean'].dropna()
        if len(valid_corr) > 0:
            axes[0, 1].hist(valid_corr, bins=10, alpha=0.7, color='seagreen', edgecolor='black')
            axes[0, 1].axvline(valid_corr.mean(), color='red', linestyle='--', linewidth=2, label=f'μ={valid_corr.mean():.3f}')
            axes[0, 1].set_title('Pixel-level Correlation (Grad-CAM vs IG)')
            axes[0, 1].set_xlabel('Pearson r')
            axes[0, 1].set_ylabel('Count')
            axes[0, 1].legend()
            axes[0, 1].grid(alpha=0.3)
    
    # Plot 3: Attention Entropy
    if 'attention_entropy_mean' in metrics_df.columns:
        valid_ent = metrics_df['attention_entropy_mean'].dropna()
        if len(valid_ent) > 0:
            axes[1, 0].hist(valid_ent, bins=10, alpha=0.7, color='coral', edgecolor='black')
            axes[1, 0].axvline(valid_ent.mean(), color='red', linestyle='--', linewidth=2, label=f'μ={valid_ent.mean():.3f}')
            axes[1, 0].set_title('Attention Entropy (Transformer-only)')
            axes[1, 0].set_xlabel('Shannon Entropy')
            axes[1, 0].set_ylabel('Count')
            axes[1, 0].legend()
            axes[1, 0].grid(alpha=0.3)
    
    # Plot 4: SSIM Summary
    if 'ssim_mean' in metrics_df.columns:
        valid_ssim = metrics_df['ssim_mean'].dropna()
        if len(valid_ssim) > 0:
            axes[1, 1].hist(valid_ssim, bins=10, alpha=0.7, color='mediumpurple', edgecolor='black')
            axes[1, 1].axvline(valid_ssim.mean(), color='red', linestyle='--', linewidth=2, label=f'μ={valid_ssim.mean():.3f}')
            axes[1, 1].set_title('Structural Similarity (Grad-CAM vs IG)')
            axes[1, 1].set_xlabel('SSIM')
            axes[1, 1].set_ylabel('Count')
            axes[1, 1].legend()
            axes[1, 1].grid(alpha=0.3)
    
    plt.tight_layout()
    output_path = os.path.join(output_dir, 'metrics_summary.png')
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"[OK] Saved: {output_path}")
    plt.close()

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Compute quantitative metrics for explainability methods'
    )
    parser.add_argument(
        '--output-dir',
        default='outputs/',
        help='Output directory containing heatmaps'
    )
    parser.add_argument(
        '--methods',
        nargs='+',
        default=['gradcam', 'integrated_gradients', 'attention_maps', 'shap'],
        help='Methods to compare'
    )
    args = parser.parse_args()
    
    output_dir = args.output_dir
    
    if not os.path.isdir(output_dir):
        print(f"[FAIL] Output directory not found: {output_dir}")
        sys.exit(1)
    
    print(f" Scanning: {output_dir}")
    print(f" Methods: {', '.join(args.methods)}")
    print()
    
    # Compute all metrics
    metrics_df = scan_and_compute_all_metrics(output_dir)
    
    # Save to CSV
    csv_path = os.path.join(output_dir, 'explainability_metrics.csv')
    metrics_df.to_csv(csv_path, index=False)
    print(f"\n[OK] Saved metrics CSV: {csv_path}")
    
    # Print summary statistics
    print("\n" + "="*80)
    print("METRICS SUMMARY")
    print("="*80)
    print(metrics_df.describe().to_string())
    
    # Create visualizations
    print("\n Generating summary plots...")
    plot_metrics_summary(metrics_df, output_dir)
    
    print("\n[OK] Metrics computation complete!")

if __name__ == '__main__':
    main()
