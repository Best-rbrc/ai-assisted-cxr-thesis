"""Model definitions for CheXpert classification."""

import timm
import torch.nn as nn
from torchvision import models


def build_model(cfg: dict) -> nn.Module:
    """Build a classification model from config.

    Supported architectures:
      - "densenet121"      (torchvision, ImageNet pretrained)
      - "densenet121_cxr"  (torchxrayvision, CXR pretrained on 7 datasets)
      - "resnet50"         (torchvision)
      - "swin_tiny"        (timm: swin_tiny_patch4_window7_224)
      - "vit_base"         (timm: vit_base_patch16_224)

    Args:
        cfg: Parsed YAML config.

    Returns:
        A PyTorch model ready for training.
    """
    model_cfg = cfg["model"]
    arch = model_cfg["architecture"]
    pretrained = model_cfg["pretrained"]
    num_classes = model_cfg["num_classes"]
    img_size = cfg["data"].get("image_size", 224)

    if arch == "densenet121":
        weights = models.DenseNet121_Weights.DEFAULT if pretrained else None
        model = models.densenet121(weights=weights)
        in_features = model.classifier.in_features
        model.classifier = nn.Linear(in_features, num_classes)

    elif arch == "densenet121_cxr":
        import torchxrayvision as xrv

        weights = "densenet121-res224-all" if pretrained else None
        model = xrv.models.DenseNet(weights=weights)
        in_features = model.classifier.in_features
        model.classifier = nn.Linear(in_features, num_classes)
        model.op_threshs = None  # disable xrv's 18-class post-processing

    elif arch == "resnet50":
        weights = models.ResNet50_Weights.DEFAULT if pretrained else None
        model = models.resnet50(weights=weights)
        in_features = model.fc.in_features
        model.fc = nn.Linear(in_features, num_classes)

    elif arch == "swin_tiny":
        model = timm.create_model(
            "swin_tiny_patch4_window7_224",
            pretrained=pretrained,
            num_classes=num_classes,
            drop_path_rate=0.1,
            img_size=img_size,
        )

    elif arch == "vit_base":
        model = timm.create_model(
            "vit_base_patch16_224",
            pretrained=pretrained,
            num_classes=num_classes,
            drop_path_rate=0.1,
            img_size=img_size,
        )

    else:
        raise ValueError(f"Unsupported architecture: {arch}")

    return model
