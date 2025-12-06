// Original Shader: https://www.shadertoy.com/view/wccSDf

#pragma header

#define iResolution vec3(openfl_TextureSize, 0.)
#define iChannel0 bitmap
#define texture flixel_texture2D

// variables which are empty, they need just to avoid crashing shader
uniform vec4 iMouse;

uniform float blurAmount;

// --- NEW CAPSULE UNIFORMS ---
// These control the total width and height of the glass capsule shape.
uniform float capsuleWidth;
uniform float capsuleHeight;

// --- NEW CORNER ROUNDING UNIFORM ---
uniform float cornerRoundingDegree; 
// --- END NEW CAPSULE UNIFORMS ---

// --- NEW DISTORTION UNIFORM ---
uniform float distortionIntensity;
// --- END NEW DISTORTION UNIFORM ---

// --- NEW COLOR TINT UNIFORMS ---
uniform vec3 tintColorRGB;
uniform float tintMixAmount;
// --- END NEW COLOR TINT UNIFORMS ---

// --- OUTLINE OPACITY UNIFORM ---
uniform float outlineOpacity;   // 0.0 = no edge, 1.0 = full bright white
// --------------------------------


// end of ShadertoyToFlixel header

// SDF of a rounded rectangle.
float sdfRect(vec2 center, vec2 size, vec2 p, float r)
{
    vec2 p_rel = p - center;
    vec2 q = abs(p_rel) - size;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Thickness is the t in the doc.
vec3 getNormal(float sd, float thickness)
{
    float dx = dFdx(sd);
    float dy = dFdy(sd);

    float n_cos = max(thickness + sd, 0.0) / thickness;
    float n_sin = sqrt(1.0 - n_cos * n_cos);

    return normalize(vec3(dx * n_cos, dy * n_cos, n_sin));
}

float height(float sd, float thickness)
{
    if(sd >= 0.0) return 0.0;
    if(sd < -thickness) return thickness;

    float x = thickness + sd;
    return sqrt(thickness * thickness - x * x);
}

// --- NEW BLUR FUNCTION ---
vec4 blurBackground(vec2 uv, float radius)
{
    vec4 sum = vec4(0.0);
    vec2 texel_size = 1.0 / iResolution.xy;
    
    for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
            vec2 offset = vec2(float(i), float(j)) * texel_size * radius;
            sum += texture(iChannel0, uv + offset);
        }
    }
    return sum / 9.0;
}

vec4 bgImage(vec2 uv)
{
    return texture(iChannel0, uv);
}

vec4 bg(vec2 uv, bool should_blur)
{
    if (should_blur) {
        return blurBackground(uv, blurAmount);
    }
    return bgImage(uv);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = fragCoord / iResolution.xy;

    float thickness = 14.0;
    float index = 1.5;
    float base_height = thickness * 8.0;
    float color_mix = 0.3;
    vec4 color_base = vec4(1.0, 1.0, 1.0, 0.0);
    
    vec2 center = iMouse.xy;
    if(center == vec2(0.0, 0.0))
    {
        center = iResolution.xy * 0.5;
    }
    
    // --- CAPSULE GEOMETRY LOGIC ---
    float halfW = capsuleWidth * 0.5;
    float halfH = capsuleHeight * 0.5;
    
    float maxR = min(halfW, halfH);
    float R = maxR * (1.0 - cornerRoundingDegree);
    
    float sizeX = max(0.0, halfW - R);
    float sizeY = max(0.0, halfH - R);
    vec2 sizeVec = vec2(sizeX, sizeY); 
    
    float sd = sdfRect(center, sizeVec, fragCoord, R);
    // --- END CAPSULE GEOMETRY LOGIC ---
    
    vec4 bg_col = vec4(0.);
    bg_col = mix(vec4(0.0), bg(uv, false),
                 clamp(sd / 100.0, 0.0, 1.0) * 0.1 + 0.9);
    bg_col.a = smoothstep(-4.,0.,sd);
    
    vec3 normal = getNormal(sd, thickness);
    
    vec3 incident = vec3(0.0, 0.0, -1.0);

    vec3 refract_vec_unscaled = refract(incident, normal, 1.0 / index);
    
    float h = height(sd, thickness);
    float refract_length = (h + base_height) /
        dot(vec3(0.0, 0.0, -1.0), refract_vec_unscaled);
    
    vec2 original_offset = refract_vec_unscaled.xy * refract_length;
    vec2 scaled_offset = original_offset * distortionIntensity;
    
    vec2 coord1 = fragCoord + scaled_offset;

    vec4 refract_color = bg(coord1 / iResolution.xy, true);

    // --- OUTLINE WITH ADJUSTABLE OPACITY ---
    vec4 reflect_color = vec4(vec3(outlineOpacity), 0.0);

    float fresnel = (1.0 - normal.z) * 2.0;

    vec4 final_glass_color = mix(refract_color, reflect_color, fresnel);

    final_glass_color = mix(final_glass_color, color_base, color_mix);

    final_glass_color.rgb = mix(final_glass_color.rgb, tintColorRGB.rgb, tintMixAmount);

    final_glass_color.a = 1.0 - smoothstep(-4., 0., sd);

    fragColor = final_glass_color;
                     
    fragColor = clamp(fragColor,0.,1.);
    bg_col = clamp(bg_col,0.,1.);
    fragColor = mix(fragColor,bg_col,bg_col.a);
}

void main() {
    mainImage(gl_FragColor, openfl_TextureCoordv*openfl_TextureSize);
}
