# FILE: py/ai.py
# Brython-KI – dynamischer Top-Down Anime-Stil
from browser import window
import json, math, random

PY_AI_READY = False

def _dir(me, enemy):
    dx = enemy["x"] - me["x"]; dy = enemy["y"] - me["y"]
    dist = (dx*dx + dy*dy) ** 0.5
    ang = math.atan2(dy, dx)
    return dx, dy, dist, ang

def decide_aggressive(state):
    me = state["self"]; enemy = state.get("closestEnemy")
    if not enemy: return "idle"
    cds = state.get("cooldowns", {})
    dx, dy, dist, ang = _dir(me, enemy)

    # Heilung falls low
    if me["hp"] < me["maxHp"] * 0.33 and cds.get("heal",0) <= 0:
        return "heal"

    # Midrange → Dash-Einstieg
    if dist > 220 and cds.get("dash",0) <= 0 and random.random()<0.6:
        return "dash"

    # Sehr nah → Spin (AoE)
    if dist < 90 and cds.get("spin",0) <= 0 and random.random()<0.4:
        return "spin"

    # Nah → Light/Heavy mix
    if dist <= 160:
        return "attack_heavy" if random.random()<0.35 else "attack_light"

    # Bewegung: Annähern + leichtes Kreisen
    return random.choice(["move_towards","strafe_left","strafe_right","move_towards","move_towards"])

def decide_defensive(state):
    me = state["self"]; enemy = state.get("closestEnemy")
    if not enemy: return "idle"
    cds = state.get("cooldowns", {})
    dx, dy, dist, ang = _dir(me, enemy)

    if me["hp"] < me["maxHp"] * 0.45 and cds.get("heal",0) <= 0:
        return "heal"

    if dist < 120:
        # ausweichen / kreisen
        return random.choice(["move_away","strafe_left","strafe_right","move_away","attack_light"])

    if dist > 240 and cds.get("dash",0) <= 0 and random.random()<0.4:
        return "dash"

    # poke
    return "attack_light" if dist < 180 else "move_towards"

def decide_random(state):
    acts = ["idle","move_towards","move_away","strafe_left","strafe_right","dash","attack_light","attack_heavy","spin","heal"]
    return random.choice(acts)

def PY_AI_DECIDE(profile_id, state_json):
    try:
        state = json.loads(state_json)
    except Exception:
        return "idle"
    if profile_id == "aggressive":
        return decide_aggressive(state)
    if profile_id == "defensive":
        return decide_defensive(state)
    return decide_random(state)

window.PY_AI_DECIDE = PY_AI_DECIDE
window.PY_AI_READY = True
PY_AI_READY = True
