var NoflandSpineLive2D_jsPath = document.scripts[document.scripts.length-1].src.substring(0,document.scripts[document.scripts.length-1].src.lastIndexOf("/")+1);
class NoflandSpineLive2D {
    init () {
        // Setup canvas and WebGL context. We pass alpha: false to canvas.getContext() so we don't use premultiplied alpha when
        // loading textures. That is handled separately by PolygonBatcher.
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        var config = { alpha: true };
        this.gl = this.canvas.getContext("webgl", config) || this.canvas.getContext("experimental-webgl", config);
        if (!this.gl) {
            alert('WebGL is unavailable.');
            return;
        }
        // Create a simple shader, mesh, model-view-projection matrix, SkeletonRenderer, and AssetManager.
        this.shader = spine.webgl.Shader.newTwoColoredTextured(this.gl);
        this.batcher = new spine.webgl.PolygonBatcher(this.gl);
        this.skeletonRenderer = new spine.webgl.SkeletonRenderer(this.gl);
        this.assetManager = new spine.webgl.AssetManager(this.gl);
    }
    load () {
        // Wait until the AssetManager has loaded all resources, then load the skeletons.
        if (this.assetManager.isLoadingComplete()) {
            this.skeleton = this.loadSkeleton("idle", true, "default");
            this.resize();
            this.lastFrameTime = Date.now() / 1000;
            requestAnimationFrame(() => this.render()); // Loading is done, call render every frame.
        } else {
            requestAnimationFrame(() => this.load());
        }
    }
    loadSkeleton (initialAnimation, premultipliedAlpha, skin) {
        if (skin === undefined) skin = "default";

        // Load the texture atlas using name.atlas from the AssetManager.
        var atlas = this.assetManager.get(NoflandSpineLive2D_jsPath+`skels/${this.skeletonData.classify}/${this.skeletonData.id}/0.atlas`);

        // Create a AtlasAttachmentLoader that resolves region, mesh, boundingbox and path attachments
        var atlasLoader = new spine.AtlasAttachmentLoader(atlas);

        if (this.skeletonData.type === "binary") {
            // Create a SkeletonBinary instance for parsing the .skel file.
            var skeletonSource = new spine.SkeletonBinary(atlasLoader);
        } else if (skel.type === "text") {
            // Create a SkeletonBinary instance for parsing the .json file.
            var skeletonSource = new spine.SkeletonJson(atlasLoader);
        }
        // Set the scale to apply during parsing, parse the file, and create a new skeleton.
        skeletonSource.scale = 1;
        var skeletonData = skeletonSource.readSkeletonData(this.assetManager.get(NoflandSpineLive2D_jsPath+`skels/${this.skeletonData.classify}/${this.skeletonData.id}/0.${this.skeletonData.ext}`));
        var skeleton = new spine.Skeleton(skeletonData);
        skeleton.setSkinByName(skin);
        var bounds = this.calculateSetupPoseBounds(skeleton);

        // Create an AnimationState, and set the initial animation in looping mode.
        var animationStateData = new spine.AnimationStateData(skeleton.data);
        var animationState = new spine.AnimationState(animationStateData);
        function animationLoop () {
            var animationEnd;
            for (var i in skeleton.data.animations) {
                animationEnd = animationState.addAnimation(0, skeleton.data.animations[i].name, false, 0);
            }
            animationEnd.listener = {start: () => animationLoop()};
        }
        animationLoop();
        // Pack everything up and return to caller.
        return { skeleton: skeleton, state: animationState, bounds: bounds, premultipliedAlpha: premultipliedAlpha };
    }
    calculateSetupPoseBounds (skeleton) {
        skeleton.setToSetupPose();
        skeleton.updateWorldTransform();
        var offset = new spine.Vector2();
        var size = new spine.Vector2();
        skeleton.getBounds(offset, size, []);
        return { offset: offset, size: size };
    }
    render () {
        var now = Date.now() / 1000;
        var delta = now - this.lastFrameTime;
        this.lastFrameTime = now;

        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        // Apply the animation state based on the delta time.
        var skeleton = this.skeleton.skeleton;
        var state = this.skeleton.state;
        var premultipliedAlpha = this.skeleton.premultipliedAlpha;
        state.update(delta);
        state.apply(skeleton);
        skeleton.updateWorldTransform();

        // Bind the shader and set the texture and model-view-projection matrix.
        this.shader.bind();
        this.shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
        this.shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, this.mvp.values);

        // Start the batch and tell the SkeletonRenderer to render the active skeleton.
        this.batcher.begin(this.shader);

        this.skeletonRenderer.premultipliedAlpha = premultipliedAlpha;
        this.skeletonRenderer.draw(this.batcher, skeleton);
        this.batcher.end();

        this.shader.unbind();

        requestAnimationFrame(() => this.render());
    }
    resize () {
        var w = this.canvas.clientWidth;
        var h = this.canvas.clientHeight;

        // Calculations to center the skeleton in the canvas.
        var bounds = this.skeleton.bounds;
        var centerX = bounds.offset.x + bounds.size.x / 2;
        var centerY = bounds.offset.y + bounds.size.y / 2;
        var scale = 1;
        var width = this.canvas.width * scale;
        var height = this.canvas.height * scale;

        this.mvp.ortho2d(centerX - width / 2,-20, width, height); // 本来y是centerY - height / 2的，但为了置底，就固定了
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    constructor (canvas, skelName) {
        this.canvas = undefined;
        this.gl = undefined;
        this.shader = undefined;
        this.batcher = undefined;
        this.mvp = new spine.webgl.Matrix4();
        this.skeletonRenderer = undefined;
        this.assetManager = undefined;
        this.lastFrameTime = undefined;
        this.skeleton = undefined;
        this.skeletonData = {};
        
        this.canvas = canvas[0];
        $.get(NoflandSpineLive2D_jsPath+'skels.json', (data) => {
            if (skelName) { // 限定
                for (this.skeletonData.id in data) {
                    if (data[this.skeletonData.id].name === skelName) {
                        break;
                    }
                }
            } else { // 随机
                this.skeletonData.id = Object.keys(data)[Math.floor(Math.random() * data.length)];
            }
            Object.assign(this.skeletonData, data[this.skeletonData.id]);

            this.init();
            // Tell AssetManager to load the resources for each skeleton, including the exported .skel file, the .atlas file and the .png
            // file for the atlas. We then wait until all resources are loaded in the load() method.
            if (this.skeletonData.type === "binary")
                this.assetManager.loadBinary(NoflandSpineLive2D_jsPath+`skels/${this.skeletonData.classify}/${this.skeletonData.id}/0.${this.skeletonData.ext}`);
            else if (this.skeletonData.type === "text")
                this.assetManager.loadText(NoflandSpineLive2D_jsPath+`skels/${this.skeletonData.classify}/${this.skeletonData.id}/0.${this.skeletonData.ext}`);
            this.assetManager.loadTextureAtlas(NoflandSpineLive2D_jsPath+`skels/${this.skeletonData.classify}/${this.skeletonData.id}/0.atlas`);
            requestAnimationFrame(() => this.load());
        }, "json");
    }
}
