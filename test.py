def extract_nft_names(nft_collection):
    names = []
    for nft in nft_collection:
        names.append(nft["name"])
    return names
