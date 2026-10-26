# Study case images

The study app loads chest X-rays and their Grad-CAM / Integrated Gradients overlays from this folder
(`patientXXXXX_studyY_viewZ_frontal.jpg`, `..._gradcam_<finding>.png`).

These images are derived from the **CheXpert** dataset and are not redistributed here, in line with the
CheXpert Research Use Agreement. To run the study app locally, obtain CheXpert from the
[Stanford AIMI Center](https://aimi.stanford.edu/datasets/chexpert-chest-x-rays) and regenerate the
case images and overlays with the scripts in `scripts/` (see the main README).
