import nodes


class CompareImagesFixed(nodes.PreviewImage):
    """image_a / image_b 를 temp 에 저장해 프론트엔드에서 비교하는 노드."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "image_a": ("IMAGE",),
                "image_b": ("IMAGE",),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "compare"
    OUTPUT_NODE = True
    CATEGORY = "image"

    def compare(self, image_a=None, image_b=None):
        result = {"a_images": [], "b_images": []}
        if image_a is not None and len(image_a) > 0:
            result["a_images"] = self.save_images(image_a, "cmpfix_a")["ui"]["images"]
        if image_b is not None and len(image_b) > 0:
            result["b_images"] = self.save_images(image_b, "cmpfix_b")["ui"]["images"]
        return {"ui": result}


NODE_CLASS_MAPPINGS = {"CompareImagesFixed": CompareImagesFixed}
NODE_DISPLAY_NAME_MAPPINGS = {"CompareImagesFixed": "Compare Images fixed"}
WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
